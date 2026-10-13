import { generate, type GenerateResult } from "./ai";
import type { Lang } from "./i18n";
import { chatPrompt } from "./prompts";
import { findTieredSources, formatSources, type Source } from "./search";
import type { WebSource } from "./web";

export type PublicSource = Omit<Source, "content" | "rank" | "coverage" | "proximity">;

export interface ChatTiers {
  /** Os apontamentos tiveram relevância suficiente. */
  notes: boolean;
  /** A Biblioteca de referência teve relevância suficiente. */
  reference: boolean;
  /** Foi permitida a consulta web (nenhum dos níveis locais chegou). */
  web: boolean;
}

export interface ChatAnswer extends GenerateResult {
  sources: (PublicSource | WebSource)[];
  tiers: ChatTiers;
}

/**
 * Responde a uma pergunta seguindo a ordem de prioridade:
 *  1) apontamentos  2) Biblioteca de referência  3) web (radiopaedia/iaea/efrs)  4) conhecimento geral.
 */
export async function answerQuestion(p: {
  userId: string;
  lang: Lang;
  question: string;
  history: string;
  documentId?: string;
  onMeta?: (meta: { sources: PublicSource[]; tiers: ChatTiers }) => void;
  onText?: (delta: string) => void;
  onWebTool?: (tool: "web_search" | "web_fetch") => void;
}): Promise<ChatAnswer> {
  const found = await findTieredSources(p.userId, p.question, { lang: p.lang, documentId: p.documentId });
  const localSources = [...found.notes, ...found.references];
  // Nível 3 só se nenhum dos níveis locais tiver relevância suficiente
  // (e não quando ela pergunta sobre um ficheiro concreto).
  const tiers: ChatTiers = {
    notes: found.notesSufficient,
    reference: found.referencesSufficient,
    web: !found.notesSufficient && !found.referencesSufficient && !p.documentId,
  };
  const publicLocal: PublicSource[] = localSources.map(({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s);
  p.onMeta?.({ sources: publicLocal, tiers });

  const result = await generate(
    chatPrompt(p.lang, {
      excertos: formatSources(localSources, p.lang),
      historico: p.history,
      pergunta: p.question,
      webAllowed: tiers.web,
    }),
    {
      lang: p.lang,
      effort: tiers.web ? "medium" : "low",
      maxTokens: 16000,
      web: tiers.web,
      onText: p.onText,
      onWebTool: p.onWebTool,
    },
  );
  // Nos chips só aparecem os excertos que a resposta cita de facto ([n]) e as fontes web usadas.
  const cited = new Set([...result.text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  const citedLocal = publicLocal.filter((s) => cited.has(s.n));
  return { ...result, sources: [...citedLocal, ...result.webSources], tiers };
}
