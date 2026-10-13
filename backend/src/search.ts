import { z } from "zod";
import { completeJson } from "./ai";
import type { Lang } from "./i18n";
import { keywordsPrompt } from "./prompts";
import { supabase } from "./supabase";

/**
 * LIMIAR DE RELEVÂNCIA (calibrado com apontamentos reais em português)
 *
 * Um fragmento é "suficientemente relevante" quando cumpre as TRÊS condições:
 *   - ts_rank >= MIN_RANK (0.05): o fragmento fala dos termos da pergunta com alguma insistência.
 *     Um fragmento centrado no tema dá ~0.05–0.08; uma menção de passagem dá ~0.02–0.03.
 *   - cobertura >= MIN_COVERAGE (0.6): contém pelo menos 60% dos termos-chave da pergunta.
 *     Evita falsos positivos de palavras genéricas repetidas ("unidade de cuidados intensivos").
 *   - proximidade >= MIN_PROXIMITY (0.01), quando aparecem 2 ou mais termos: os termos estão
 *     perto uns dos outros (ts_rank_cd). Nos fragmentos que tratam o tema deu 0.038–0.205; num
 *     texto que diz "Godfrey Hounsfield construiu…" e, noutra frase, "A unidade de TC…" deu 0.001–0.003.
 *
 * Um nível (apontamentos ou referência) "chega" se tiver pelo menos 1 fragmento relevante.
 */
export const MIN_RANK = 0.05;
export const MIN_COVERAGE = 0.6;
export const MIN_PROXIMITY = 0.01;

export type SourceKind = "apontamentos" | "referencia";

export interface Source {
  n: number;
  kind: SourceKind;
  org: "IAEA" | "EFRS" | null;
  chunk_id: number;
  document_id: string;
  document_title: string;
  page: number | null;
  excerpt: string;
  content: string;
  rank: number;
  coverage: number;
  proximity: number | null;
}

interface ChunkHit {
  id: number;
  document_id: string;
  content: string;
  page: number | null;
  rank: number;
  coverage: number;
  proximity: number | null;
}

// Palavras de pergunta que não dizem nada sobre o tema e baixariam a cobertura.
const FILLER_WORDS = new Set(
  (
    "explica explicar explica-me explícame explicame diferença diferenças diferencia diferencias " +
    "qual quais cuál cuáles cual cuales define definir definição definición significa significado " +
    "serve sirve funciona exemplo exemplos ejemplo ejemplos pergunta perguntas pregunta preguntas " +
    "faz faça hazme haz dime diz resume resumo resumen fala habla sobre importante coisa cosa " +
    "porque porquê por qué como cómo quando cuándo onde dónde " +
    // Palavras vazias do espanhol: o dicionário do Postgres é português e não as elimina.
    "qué que es son el la los las lo un una unos unas del al y o u para por con sin se su sus " +
    "mi mis me te le les nos este esta estos estas ese esa eso hay muy más pero también entre"
  ).split(/\s+/),
);

export function keyTerms(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER_WORDS.has(w))
    .join(" ");
}

async function runSearch(
  userId: string,
  terms: string,
  limit: number,
  sourceType: SourceKind,
  documentId?: string,
): Promise<ChunkHit[]> {
  if (!terms.trim()) return [];
  const { data, error } = await supabase.rpc("search_chunks", {
    p_user: userId,
    p_terms: terms,
    p_limit: limit,
    p_document: documentId ?? null,
    p_source_type: sourceType,
  });
  if (error) throw error;
  return (data ?? []) as ChunkHit[];
}

export const isRelevant = (h: { rank: number; coverage: number; proximity: number | null }) =>
  h.rank >= MIN_RANK && h.coverage >= MIN_COVERAGE && (h.proximity === null || h.proximity >= MIN_PROXIMITY);

const keywordsSchema = z.object({ keywords: z.array(z.string()).min(1).max(8) });

/** Palavras-chave em português pedidas à IA (os apontamentos e a referência estão em português). */
async function aiKeywords(question: string): Promise<string | null> {
  try {
    const { keywords } = await completeJson(keywordsPrompt(question), keywordsSchema, {
      lang: "pt",
      effort: "low",
      maxTokens: 1000,
    });
    return keywords.map((k) => k.replace(/["()|&!:]/g, " ").trim()).join(" ");
  } catch (err) {
    console.error("Falha ao extrair palavras-chave:", err);
    return null;
  }
}

/**
 * Pesquisa num nível. Primeiro com os termos da própria pergunta; se não houver nada relevante
 * (por ex. pergunta em espanhol ou com outras palavras), tenta com palavras-chave da IA e junta.
 */
async function searchTier(
  userId: string,
  question: string,
  sourceType: SourceKind,
  opts: { limit: number; documentId?: string; expand: boolean; keywords: () => Promise<string | null> },
): Promise<ChunkHit[]> {
  let hits = await runSearch(userId, keyTerms(question), opts.limit, sourceType, opts.documentId);
  if (!hits.some(isRelevant) && opts.expand) {
    const kw = await opts.keywords();
    if (kw) {
      const extra = await runSearch(userId, kw, opts.limit, sourceType, opts.documentId);
      const seen = new Set(hits.map((h) => h.id));
      hits = [...hits, ...extra.filter((h) => !seen.has(h.id))].sort((a, b) => b.rank - a.rank).slice(0, opts.limit);
    }
  }
  return hits;
}

async function toSources(userId: string, hits: ChunkHit[], kind: SourceKind, startAt: number): Promise<Source[]> {
  if (hits.length === 0) return [];
  const docIds = [...new Set(hits.map((h) => h.document_id))];
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, reference_org")
    .in("id", docIds)
    .eq("user_id", userId);
  const byId = new Map((docs ?? []).map((d) => [d.id as string, d]));
  return hits.map((h, i) => ({
    n: startAt + i,
    kind,
    org: (byId.get(h.document_id)?.reference_org as Source["org"]) ?? null,
    chunk_id: h.id,
    document_id: h.document_id,
    document_title: (byId.get(h.document_id)?.title as string) ?? "Documento",
    page: h.page,
    content: h.content,
    excerpt: h.content.slice(0, 220).replace(/\s+/g, " ") + (h.content.length > 220 ? "…" : ""),
    rank: h.rank,
    coverage: h.coverage,
    proximity: h.proximity,
  }));
}

export interface TieredResult {
  notes: Source[];
  references: Source[];
  notesSufficient: boolean;
  referencesSufficient: boolean;
}

/**
 * Ordem de prioridade: 1) apontamentos dela; 2) Biblioteca de referência (IAEA/EFRS).
 * A referência só é consultada se os apontamentos não chegarem.
 * O chamador decide se passa ao nível 3 (pesquisa web) quando nenhum dos dois chega.
 */
export async function findTieredSources(
  userId: string,
  question: string,
  opts: { lang: Lang; documentId?: string; expand?: boolean },
): Promise<TieredResult> {
  // As palavras-chave da IA só se pedem uma vez, e só se forem precisas.
  let kwPromise: Promise<string | null> | null = null;
  const keywords = () => (kwPromise ??= aiKeywords(question));
  const expand = opts.expand !== false;

  const noteHits = await searchTier(userId, question, "apontamentos", {
    limit: 8,
    documentId: opts.documentId,
    expand,
    keywords,
  });
  const notesSufficient = noteHits.some(isRelevant);

  // Se ela filtrou por um documento, não misturamos referência; se os apontamentos chegam, também não.
  let refHits: ChunkHit[] = [];
  if (!notesSufficient && !opts.documentId) {
    refHits = (await searchTier(userId, question, "referencia", { limit: 5, expand, keywords })).filter(isRelevant);
  }

  // Apontamentos: se chegam, mandamos os melhores; se não, só os que tocam no tema (cobertura >= 50%),
  // para a IA não atribuir aos apontamentos algo que lá não está. Referência: só os relevantes.
  const notesToSend = notesSufficient ? noteHits : noteHits.filter((h) => h.coverage >= 0.5).slice(0, 4);
  const notes = await toSources(userId, notesToSend, "apontamentos", 1);
  const references = await toSources(userId, refHits, "referencia", notes.length + 1);
  return {
    notes,
    references,
    notesSufficient,
    referencesSufficient: refHits.length > 0,
  };
}

/**
 * Material de referência relacionado com um documento dela (para o material de estudo).
 * Usa as 8 palavras mais frequentes do documento. Como são termos gerais do tema (e não 2–3 termos
 * de uma pergunta), basta cobrir 40% deles; o ts_rank mínimo é o mesmo (0.05).
 */
export async function findReferenceForDocument(userId: string, documentId: string, limit = 4): Promise<Source[]> {
  const { data: words, error } = await supabase.rpc("document_keywords", { p_document: documentId, p_limit: 8 });
  if (error) throw error;
  const terms = ((words ?? []) as { word: string }[]).map((w) => w.word).join(" ");
  if (!terms) return [];
  const hits = (await runSearch(userId, terms, limit * 2, "referencia"))
    .filter((h) => h.rank >= MIN_RANK && h.coverage >= 0.4)
    .slice(0, limit);
  return toSources(userId, hits, "referencia", 1);
}

/** Pesquisa simples (buscador da Biblioteca, explicações do teste): apontamentos e referência, sem IA. */
export async function findSources(
  userId: string,
  question: string,
  opts: { limit?: number; documentId?: string; includeReference?: boolean } = {},
): Promise<Source[]> {
  const limit = opts.limit ?? 8;
  const notes = await toSources(
    userId,
    await runSearch(userId, keyTerms(question), limit, "apontamentos", opts.documentId),
    "apontamentos",
    1,
  );
  if (!opts.includeReference) return notes;
  const refs = await toSources(
    userId,
    await runSearch(userId, keyTerms(question), Math.ceil(limit / 2), "referencia"),
    "referencia",
    notes.length + 1,
  );
  return [...notes, ...refs];
}

/** Texto dos excertos para o prompt, com a origem de cada um. */
export function formatSources(sources: Source[], lang: Lang): string {
  return sources
    .map((s) => {
      const origin =
        s.kind === "apontamentos"
          ? lang === "es"
            ? "Tus apuntes"
            : "Os teus apontamentos"
          : `${lang === "es" ? "Biblioteca de referencia" : "Biblioteca de referência"} – ${s.org ?? "IAEA / EFRS"}`;
      const page = s.page ? (lang === "es" ? `, página ${s.page}` : `, página ${s.page}`) : "";
      return `[${s.n}] (${origin}) ${s.document_title}${page}\n${s.content}`;
    })
    .join("\n\n---\n\n");
}
