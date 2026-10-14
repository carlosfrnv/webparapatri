import { generate, type GenerateResult } from "./ai";
import type { Lang } from "./i18n";
import { chatPrompt } from "./prompts";
import { findTieredSources, formatSources, type Source } from "./search";
import type { WebSource } from "./web";

export type PublicSource = Omit<Source, "content" | "rank" | "coverage" | "proximity">;

export interface ChatTiers {
  /** Sus apuntes han tenido relevancia suficiente. */
  notes: boolean;
  /** La biblioteca de referencia ha tenido relevancia suficiente. */
  reference: boolean;
  /** Se ha permitido la consulta web (ninguno de los niveles locales bastaba). */
  web: boolean;
}

export interface ChatAnswer extends GenerateResult {
  sources: (PublicSource | WebSource)[];
  tiers: ChatTiers;
}

/**
 * Responde a una pregunta siguiendo el orden de prioridad:
 *  1) apuntes  2) biblioteca de referencia  3) web (radiopaedia/iaea/efrs)  4) conocimiento general.
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
  // Nivel 3 solo si ninguno de los niveles locales tiene relevancia suficiente
  // (y no cuando pregunta sobre un archivo concreto).
  const tiers: ChatTiers = {
    notes: found.notesSufficient,
    reference: found.referencesSufficient,
    web: !found.notesSufficient && !found.referencesSufficient && !p.documentId,
  };
  const publicLocal: PublicSource[] = localSources.map(({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s);
  p.onMeta?.({ sources: publicLocal, tiers });

  const result = await generate(
    chatPrompt(p.lang, {
      fragmentos: formatSources(localSources, p.lang),
      historial: p.history,
      pregunta: p.question,
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
  // En los chips solo aparecen los fragmentos que la respuesta cita de verdad ([n]) y las fuentes web usadas.
  const cited = new Set([...result.text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  const citedLocal = publicLocal.filter((s) => cited.has(s.n));
  return { ...result, sources: [...citedLocal, ...result.webSources], tiers };
}
