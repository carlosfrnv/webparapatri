import { z } from "zod";
import { config } from "./config";
import type { Lang, MessageKey } from "./i18n";
import { anthropicProvider } from "./llm/anthropic";
import { gemini } from "./llm/gemini";
import { groqProvider } from "./llm/groq";
import { ProviderError, type Effort, type LlmImage, type Provider } from "./llm/types";
import { BASE_SYSTEM } from "./prompts";
import type { WebSource } from "./web";

export class AiError extends Error {
  constructor(public key: MessageKey) {
    super(key);
  }
}

// ---------- Cadena de proveedores ----------
//
// AI_CHAIN indica el orden, por ejemplo:
//   gemini:gemini-flash-latest,gemini:gemini-flash-lite-latest,groq:openai/gpt-oss-120b
// Se salta cualquier paso sin clave configurada. Si un modelo agota su cupo gratuito,
// se deja "en pausa" un rato y se usa el siguiente.

interface Step {
  provider: Provider;
  model: string;
  key: string;
}

const PROVIDERS: Record<string, { provider: Provider; hasKey: () => boolean }> = {
  gemini: { provider: gemini, hasKey: () => !!config.GEMINI_API_KEY },
  groq: { provider: groqProvider, hasKey: () => !!config.GROQ_API_KEY },
  anthropic: { provider: anthropicProvider, hasKey: () => !!config.ANTHROPIC_API_KEY },
};

export const CHAIN: Step[] = config.AI_CHAIN.split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .flatMap((entry) => {
    const [id, ...rest] = entry.split(":");
    const model = rest.join(":").trim();
    const p = PROVIDERS[id?.trim().toLowerCase()];
    if (!p || !model || !p.hasKey()) return [];
    return [{ provider: p.provider, model, key: `${p.provider.id}:${model}` }];
  });

const cooldownUntil = new Map<string, number>();
const webCooldownUntil = new Map<string, number>();
const cooling = (map: Map<string, number>, key: string) => (map.get(key) ?? 0) > Date.now();

interface AiOptions {
  lang: Lang;
  effort?: Effort;
  maxTokens?: number;
}

interface GenerateOptions extends AiOptions {
  /** Pide JSON (modo JSON nativo cuando el proveedor lo tiene). */
  json?: boolean;
  /** Permite la consulta en vivo a Radiopaedia, IAEA y EFRS (nivel 3) si el proveedor puede buscar. */
  web?: boolean;
  onText?: (delta: string) => void;
  /** Se llama cuando la IA empieza una búsqueda o lectura web. */
  onWebTool?: (tool: "web_search" | "web_fetch") => void;
  /** Un modelo ha fallado a mitad de respuesta y otro va a empezar: hay que borrar el texto parcial. */
  onReset?: () => void;
  /** Fotos adjuntas: solo se usan los modelos que pueden verlas. */
  images?: LlmImage[];
}

export interface GenerateResult {
  text: string;
  webSources: WebSource[];
  webSearches: number;
  searchSuggestionsHtml?: string;
  /** Modelo que ha respondido, p. ej. "gemini:gemini-flash-latest". */
  model: string;
  /** Si la respuesta ha podido usar la búsqueda web. */
  usedWeb: boolean;
}

/**
 * Petición a la IA recorriendo la cadena de proveedores.
 * `prompt` puede ser una función: recibe si la búsqueda web está disponible de verdad en ese intento,
 * para no decirle a la IA que puede buscar cuando no puede (y que no se invente fuentes).
 */
export async function generate(
  prompt: string | ((webAvailable: boolean) => string),
  opts: GenerateOptions,
): Promise<GenerateResult> {
  if (CHAIN.length === 0) throw new AiError("aiUnavailable");
  const build = typeof prompt === "function" ? prompt : () => prompt;
  let emitted = false;
  const onText = opts.onText
    ? (t: string) => {
        emitted = true;
        opts.onText!(t);
      }
    : undefined;

  for (const step of CHAIN) {
    if (cooling(cooldownUntil, step.key)) continue;
    if (opts.images?.length && !step.provider.supportsImages) continue;
    let useWeb = !!opts.web && step.provider.supportsWeb && !cooling(webCooldownUntil, step.key);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (emitted) {
        opts.onReset?.();
        emitted = false;
      }
      try {
        const result = await step.provider.generate(step.model, {
          system: BASE_SYSTEM[opts.lang],
          prompt: build(useWeb),
          effort: opts.effort ?? "medium",
          maxTokens: opts.maxTokens ?? 16000,
          json: !!opts.json,
          web: useWeb,
          images: opts.images,
          onText,
          onWebTool: opts.onWebTool,
        });
        return { ...result, model: step.key, usedWeb: useWeb };
      } catch (err) {
        if (err instanceof ProviderError) {
          if (err.kind === "refused") throw new AiError("aiRefused");
          if (err.kind === "noWeb" && useWeb) {
            // La búsqueda web no está disponible con este modelo (p. ej., fuera del plan gratuito):
            // repetimos con el mismo modelo, sin búsqueda y con el prompt adaptado.
            console.warn(`[IA] ${step.key}: búsqueda web no disponible, se responde sin ella.`);
            webCooldownUntil.set(step.key, Date.now() + err.cooldownMs);
            useWeb = false;
            continue;
          }
          console.warn(`[IA] ${step.key}: ${err.kind} – se prueba el siguiente modelo.`, err.message.slice(0, 200));
          cooldownUntil.set(step.key, Date.now() + err.cooldownMs);
        } else {
          console.error(`[IA] ${step.key}: error inesperado – se prueba el siguiente modelo.`, err);
          cooldownUntil.set(step.key, Date.now() + 30_000);
        }
        break;
      }
    }
  }
  if (emitted) opts.onReset?.();
  throw new AiError("aiUnavailable");
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
  opts: AiOptions & { images?: LlmImage[] },
): Promise<z.infer<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = (await generate(prompt, { ...opts, json: true })).text;
    try {
      return schema.parse(JSON.parse(stripCodeFences(text)));
    } catch (err) {
      lastError = err;
    }
  }
  console.error("JSON no válido de la IA:", lastError);
  throw new AiError("aiBadFormat");
}
