import { generate, type GenerateResult } from "./ai";
import type { Lang } from "./i18n";
import type { LlmImage } from "./llm/types";
import { chatPrompt, OFF_TOPIC_MARKER } from "./prompts";
import { findTieredSources, formatSources, type Source } from "./search";
import { WEB_ENABLED, type WebSource } from "./web";

export type PublicSource = Omit<Source, "content" | "rank" | "coverage" | "proximity">;

export interface ChatTiers {
  /** Sus apuntes han tenido relevancia suficiente. */
  notes: boolean;
  /** La biblioteca de referencia ha tenido relevancia suficiente. */
  reference: boolean;
  /** Se ha permitido la consulta web (ninguno de los niveles locales bastaba). */
  web: boolean;
}

/** HTML de las sugerencias de búsqueda de Google (obligatorio mostrarlo si se ha usado su búsqueda). */
export interface SearchSuggestions {
  kind: "search_suggestions";
  html: string;
}

export interface ChatAnswer extends GenerateResult {
  sources: (PublicSource | WebSource | SearchSuggestions)[];
  tiers: ChatTiers;
}

/**
 * Responde a una pregunta siguiendo el orden de prioridad:
 *  1) apuntes  2) biblioteca de referencia  3) web (radiopaedia/iaea/efrs)  4) conocimiento general.
 */
// Está preparando un trabajo y pide fuentes / búsqueda en internet (en español o portugués).
const RESEARCH_RE =
  /\b(trabajo|trabalho|informe|relat[oó]rio|monograf[ií]a|ensayo|fuentes?|fontes?|bibliograf[ií]a|referencias|refer[eê]ncias|citar|cita[sr]?|internet|webs? fiables?|sites? fi[aá]veis|pesquis[ae]r?|investigar|apartados?|[ií]ndice)\b/i;

/** Modo trabajo: la pregunta (o lo último que ha escrito en esta conversación) es sobre un trabajo con fuentes. */
export function isResearch(question: string, history: string) {
  if (RESEARCH_RE.test(question)) return true;
  const lastUser = history
    .split("\n")
    .filter((l) => /^(Estudiante|Estudante):/.test(l))
    .slice(-2)
    .join(" ");
  return RESEARCH_RE.test(lastUser) && question.length > 40;
}

export async function answerQuestion(p: {
  userId: string;
  lang: Lang;
  question: string;
  history: string;
  documentId?: string;
  images?: LlmImage[];
  /** Modo conversación: respuestas cortas y habladas (se leen en voz alta). */
  voice?: boolean;
  onMeta?: (meta: { sources: PublicSource[]; tiers: ChatTiers }) => void;
  onText?: (delta: string) => void;
  onWebTool?: (tool: "web_search" | "web_fetch") => void;
  onReset?: () => void;
}): Promise<ChatAnswer> {
  const found = await findTieredSources(p.userId, p.question, { lang: p.lang, documentId: p.documentId });
  const localSources = [...found.notes, ...found.references];
  const research = !p.voice && isResearch(p.question, p.history);
  // Nivel 3 solo si ninguno de los niveles locales tiene relevancia suficiente
  // (y no cuando pregunta sobre un archivo concreto).
  const tiers: ChatTiers = {
    notes: found.notesSufficient,
    reference: found.referencesSufficient,
    // En un trabajo con fuentes siempre se busca en internet (aunque sus apuntes hablen del tema).
    web: WEB_ENABLED && (research || (!found.notesSufficient && !found.referencesSufficient && !p.documentId)),
  };
  const publicLocal: PublicSource[] = localSources.map(
    ({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s,
  );
  p.onMeta?.({ sources: publicLocal, tiers });

  // Si la IA responde con la marca de "fuera de tema", no la mandamos a la web mientras se escribe:
  // retenemos el principio de la respuesta hasta saber si es la marca o texto normal.
  let pending = "";
  let decided = false;
  const onText = p.onText
    ? (delta: string) => {
        if (decided) return p.onText!(delta);
        pending += delta;
        const head = pending.trimStart();
        if (head.length >= OFF_TOPIC_MARKER.length || !OFF_TOPIC_MARKER.startsWith(head)) {
          decided = true;
          if (!head.startsWith(OFF_TOPIC_MARKER)) p.onText!(pending);
        }
      }
    : undefined;
  const onReset = () => {
    pending = "";
    decided = false;
    p.onReset?.();
  };

  const result = await generate(
    // Si el modelo que responde no puede buscar en internet, el prompt no le ofrece la búsqueda.
    (webAvailable) =>
      chatPrompt(p.lang, {
        fragmentos: formatSources(localSources, p.lang),
        historial: p.history,
        pregunta: p.question,
        webAllowed: tiers.web && webAvailable,
        imagenes: p.images?.length ?? 0,
        voz: p.voice,
        trabajo: research,
      }),
    {
      lang: p.lang,
      effort: research ? "high" : tiers.web ? "medium" : "low",
      maxTokens: research ? 24000 : 16000,
      web: tiers.web,
      research,
      images: p.images,
      onText,
      onWebTool: p.onWebTool,
      onReset,
    },
  );
  if (result.text.trimStart().startsWith(OFF_TOPIC_MARKER)) {
    // Pregunta ajena a sus estudios: la web muestra el mensaje de dedicatoria.ts en lugar del texto.
    return {
      ...result,
      text: OFF_TOPIC_MARKER,
      webSources: [],
      searchSuggestionsHtml: undefined,
      sources: [],
      tiers: { ...tiers, web: false },
    };
  }
  // En los chips solo aparecen los fragmentos que la respuesta cita de verdad ([n]) y las fuentes web usadas.
  const cited = new Set([...result.text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  const citedLocal = publicLocal.filter((s) => cited.has(s.n));
  const suggestions: SearchSuggestions[] = result.searchSuggestionsHtml
    ? [{ kind: "search_suggestions", html: result.searchSuggestionsHtml }]
    : [];
  return {
    ...result,
    sources: [...citedLocal, ...result.webSources, ...suggestions],
    tiers: { ...tiers, web: result.usedWeb },
  };
}
