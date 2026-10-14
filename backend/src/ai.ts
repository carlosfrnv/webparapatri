import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { config } from "./config";
import type { Lang, MessageKey } from "./i18n";
import { BASE_SYSTEM } from "./prompts";
import { extractWebSources, finalAnswerText, WEB_TOOLS, type WebSource } from "./web";

export const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

type Effort = "low" | "medium" | "high";

// Modelos que aceptan el "fallback" del lado del servidor: si la petición se rechaza
// por un falso positivo de los filtros de seguridad, la API prueba con otro modelo.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function requestBase(lang: Lang, effort: Effort) {
  const useFallback = FALLBACK_MODELS.has(config.ANTHROPIC_MODEL);
  return {
    model: config.ANTHROPIC_MODEL,
    system: BASE_SYSTEM[lang],
    output_config: { effort },
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export class AiError extends Error {
  constructor(public key: MessageKey) {
    super(key);
  }
}

interface AiOptions {
  lang: Lang;
  effort?: Effort;
  maxTokens?: number;
}

interface GenerateOptions extends AiOptions {
  /** Activa la consulta en vivo a radiopaedia.org, iaea.org y efrs.eu (nivel 3). */
  web?: boolean;
  onText?: (delta: string) => void;
  /** Se llama cuando la IA empieza una búsqueda o lectura web. */
  onWebTool?: (tool: "web_search" | "web_fetch") => void;
}

export interface GenerateResult {
  text: string;
  webSources: WebSource[];
  webSearches: number;
}

// La API puede "pausar" una pregunta durante búsquedas largas; la reanudamos como máximo 3 veces.
const MAX_CONTINUATIONS = 3;

/** Petición a la IA (en streaming), opcionalmente con búsqueda web restringida a los dominios de referencia. */
export async function generate(prompt: string, opts: GenerateOptions): Promise<GenerateResult> {
  const messages: BetaMessageParam[] = [{ role: "user", content: prompt }];
  const content: BetaContentBlock[] = [];
  let webSearches = 0;

  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const stream = anthropic.beta.messages.stream({
      ...requestBase(opts.lang, opts.effort ?? "medium"),
      max_tokens: opts.maxTokens ?? 32000,
      messages,
      ...(opts.web ? { tools: WEB_TOOLS } : {}),
    });
    if (opts.onText) stream.on("text", opts.onText);
    if (opts.onWebTool) {
      stream.on("streamEvent", (event) => {
        if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
          const name = event.content_block.name;
          if (name === "web_search" || name === "web_fetch") opts.onWebTool?.(name);
        }
      });
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new AiError("aiRefused");
    content.push(...message.content);
    webSearches += message.usage.server_tool_use?.web_search_requests ?? 0;

    if (message.stop_reason === "pause_turn") {
      // La API ha pausado la búsqueda: le devolvemos la respuesta parcial tal cual para que continúe.
      messages.push({ role: "assistant", content: message.content as BetaContentBlockParam[] });
      continue;
    }
    break;
  }

  return {
    text: opts.web ? finalAnswerText(content) : content.map((b) => (b.type === "text" ? b.text : "")).join("").trim(),
    webSources: opts.web ? extractWebSources(content) : [],
    webSearches,
  };
}

/** Petición sencilla que devuelve el texto completo de la respuesta. */
export async function complete(prompt: string, opts: AiOptions): Promise<string> {
  return (await generate(prompt, opts)).text;
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Pide JSON, lo valida con zod y lo intenta una vez más si falla. */
export async function completeJson<T extends z.ZodType>(
  prompt: string,
  schema: T,
  opts: AiOptions,
): Promise<z.infer<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(prompt, opts);
    try {
      return schema.parse(JSON.parse(stripCodeFences(text)));
    } catch (err) {
      lastError = err;
    }
  }
  console.error("JSON no válido de la IA:", lastError);
  throw new AiError("aiBadFormat");
}
