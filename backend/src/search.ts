import { z } from "zod";
import { completeJson } from "./ai";
import type { Lang } from "./i18n";
import { keywordsPrompt } from "./prompts";
import { supabase } from "./supabase";

/**
 * UMBRAL DE RELEVANCIA (calibrado con apuntes reales en portugués)
 *
 * Un fragmento es "suficientemente relevante" cuando cumple las TRES condiciones:
 *   - ts_rank >= MIN_RANK (0.05): el fragmento habla de los términos de la pregunta con cierta insistencia.
 *     Un fragmento centrado en el tema da ~0.05–0.08; una mención de pasada da ~0.02–0.03.
 *   - cobertura >= MIN_COVERAGE (0.6): contiene al menos el 60 % de los términos clave de la pregunta.
 *     Evita falsos positivos por palabras genéricas repetidas ("unidade de cuidados intensivos").
 *   - proximidad >= MIN_PROXIMITY (0.01), cuando aparecen 2 o más términos: los términos están
 *     cerca unos de otros (ts_rank_cd). En los fragmentos que tratan el tema dio 0.038–0.205; en un
 *     texto que dice "Godfrey Hounsfield construiu…" y, en otra frase, "A unidade de TC…" dio 0.001–0.003.
 *
 * Un nivel (apuntes o referencia) "basta" si tiene al menos 1 fragmento relevante.
 */
export const MIN_RANK = 0.05;
export const MIN_COVERAGE = 0.6;
export const MIN_PROXIMITY = 0.01;

export type SourceKind = "apuntes" | "referencia";

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

// Palabras de pregunta que no dicen nada del tema y bajarían la cobertura.
const FILLER_WORDS = new Set(
  (
    "explica explicar explica-me explícame explicame diferença diferenças diferencia diferencias " +
    "qual quais cuál cuáles cual cuales define definir definição definición significa significado " +
    "serve sirve funciona exemplo exemplos ejemplo ejemplos pergunta perguntas pregunta preguntas " +
    "faz faça hazme haz dime diz resume resumo resumen fala habla sobre importante coisa cosa " +
    "porque porquê por qué como cómo quando cuándo onde dónde " +
    // Palabras vacías del español: el diccionario de Postgres es portugués y no las elimina.
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

/** Palabras clave en portugués pedidas a la IA (los apuntes y la referencia están en portugués). */
async function aiKeywords(question: string): Promise<string | null> {
  try {
    const { keywords } = await completeJson(keywordsPrompt(question), keywordsSchema, {
      lang: "pt",
      effort: "low",
      maxTokens: 1000,
    });
    return keywords.map((k) => k.replace(/["()|&!:]/g, " ").trim()).join(" ");
  } catch (err) {
    console.error("Error al extraer palabras clave:", err);
    return null;
  }
}

/**
 * Busca en un nivel. Primero con los términos de la propia pregunta; si no hay nada relevante
 * (p. ej., pregunta en español o con otras palabras), lo intenta con palabras clave de la IA y lo junta.
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
 * Orden de prioridad: 1) sus apuntes; 2) biblioteca de referencia (IAEA/EFRS).
 * La referencia solo se consulta si los apuntes no bastan.
 * Quien llama decide si pasa al nivel 3 (búsqueda web) cuando ninguno de los dos basta.
 */
export async function findTieredSources(
  userId: string,
  question: string,
  opts: { lang: Lang; documentId?: string; expand?: boolean },
): Promise<TieredResult> {
  // Las palabras clave de la IA se piden una sola vez, y solo si hacen falta.
  let kwPromise: Promise<string | null> | null = null;
  const keywords = () => (kwPromise ??= aiKeywords(question));
  const expand = opts.expand !== false;

  const noteHits = await searchTier(userId, question, "apuntes", {
    limit: 8,
    documentId: opts.documentId,
    expand,
    keywords,
  });
  const notesSufficient = noteHits.some(isRelevant);

  // Si ha filtrado por un documento, no mezclamos referencia; si los apuntes bastan, tampoco.
  let refHits: ChunkHit[] = [];
  if (!notesSufficient && !opts.documentId) {
    refHits = (await searchTier(userId, question, "referencia", { limit: 5, expand, keywords })).filter(isRelevant);
  }

  // Apuntes: si bastan, mandamos los mejores; si no, solo los que tocan el tema (cobertura >= 50 %),
  // para que la IA no atribuya a los apuntes algo que no está en ellos. Referencia: solo los relevantes.
  const notesToSend = notesSufficient ? noteHits : noteHits.filter((h) => h.coverage >= 0.5).slice(0, 4);
  const notes = await toSources(userId, notesToSend, "apuntes", 1);
  const references = await toSources(userId, refHits, "referencia", notes.length + 1);
  return {
    notes,
    references,
    notesSufficient,
    referencesSufficient: refHits.length > 0,
  };
}

/**
 * Material de referencia relacionado con uno de sus documentos (para el material de estudio).
 * Usa las 8 palabras más frecuentes del documento. Como son términos generales del tema (y no 2–3
 * términos de una pregunta), basta con cubrir el 40 %; el ts_rank mínimo es el mismo (0.05).
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

/** Búsqueda simple (buscador de la Biblioteca, explicaciones del test): apuntes y referencia, sin IA. */
export async function findSources(
  userId: string,
  question: string,
  opts: { limit?: number; documentId?: string; includeReference?: boolean } = {},
): Promise<Source[]> {
  const limit = opts.limit ?? 8;
  const notes = await toSources(
    userId,
    await runSearch(userId, keyTerms(question), limit, "apuntes", opts.documentId),
    "apuntes",
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

/** Texto de los fragmentos para el prompt, con el origen de cada uno. */
export function formatSources(sources: Source[], lang: Lang): string {
  return sources
    .map((s) => {
      const origin =
        s.kind === "apuntes"
          ? lang === "es"
            ? "Tus apuntes"
            : "Os teus apontamentos"
          : `${lang === "es" ? "Biblioteca de referencia" : "Biblioteca de referência"} – ${s.org ?? "IAEA / EFRS"}`;
      const page = s.page ? (lang === "es" ? `, página ${s.page}` : `, página ${s.page}`) : "";
      return `[${s.n}] (${origin}) ${s.document_title}${page}\n${s.content}`;
    })
    .join("\n\n---\n\n");
}
