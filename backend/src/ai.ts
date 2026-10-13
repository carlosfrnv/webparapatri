import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { config } from "./config";
import type { Lang, MessageKey } from "./i18n";
import { BASE_SYSTEM } from "./prompts";

export const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

type Effort = "low" | "medium" | "high";

// Modelos que aceitam o "fallback" do lado do servidor: se o pedido for recusado
// por um falso positivo dos filtros de segurança, a API tenta outro modelo.
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

/** Pedido simples que devolve o texto completo da resposta. */
export async function complete(prompt: string, opts: AiOptions): Promise<string> {
  // Em streaming para não bater nos limites de tempo com textos longos.
  const stream = anthropic.beta.messages.stream({
    ...requestBase(opts.lang, opts.effort ?? "medium"),
    max_tokens: opts.maxTokens ?? 32000,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new AiError("aiRefused");
  }
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Pede JSON, valida com zod e tenta mais uma vez se falhar. */
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
  console.error("JSON inválido da IA:", lastError);
  throw new AiError("aiBadFormat");
}

/** Resposta em streaming para o chat. Chama onText com cada pedaço de texto. */
export async function streamAnswer(
  lang: Lang,
  prompt: string,
  history: BetaMessageParam[],
  onText: (text: string) => void,
): Promise<string> {
  const stream = anthropic.beta.messages.stream({
    ...requestBase(lang, "low"),
    max_tokens: 16000,
    messages: [...history, { role: "user", content: prompt }],
  });
  stream.on("text", onText);
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new AiError("aiRefused");
  }
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}
