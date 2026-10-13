import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { config } from "./config";

export const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// Base comum a todos os prompts (português europeu).
export const BASE_SYSTEM = `És um tutor especializado na Licenciatura em Imagem Médica e Radioterapia
(Radiologia, Medicina Nuclear e Radioterapia), a ajudar uma estudante em Portugal.
Escreve sempre em português europeu, de forma clara e didática.
Baseia-te nos apontamentos fornecidos. Nunca inventes valores de dose,
parâmetros técnicos, protocolos ou dados clínicos. Se algo não estiver nos
apontamentos e tiveres de usar conhecimento geral, assinala-o com
"Fora dos teus apontamentos:". Se não souberes, diz que não sabes.`;

type Effort = "low" | "medium" | "high";

// Modelos que aceitam o "fallback" do lado do servidor: se o pedido for recusado
// por um falso positivo dos filtros de segurança, a API tenta outro modelo.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function requestBase(effort: Effort) {
  const useFallback = FALLBACK_MODELS.has(config.ANTHROPIC_MODEL);
  return {
    model: config.ANTHROPIC_MODEL,
    system: BASE_SYSTEM,
    output_config: { effort },
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export class AiError extends Error {}

/** Pedido simples que devolve o texto completo da resposta. */
export async function complete(prompt: string, opts: { effort?: Effort; maxTokens?: number } = {}): Promise<string> {
  // Em streaming para não bater nos limites de tempo com textos longos.
  const stream = anthropic.beta.messages.stream({
    ...requestBase(opts.effort ?? "medium"),
    max_tokens: opts.maxTokens ?? 32000,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new AiError("A IA não conseguiu responder a este pedido.");
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
  opts: { effort?: Effort; maxTokens?: number } = {},
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
  throw new AiError("A IA devolveu uma resposta num formato inesperado. Tenta regenerar.");
}

/** Resposta em streaming para o chat. Chama onText com cada pedaço de texto. */
export async function streamAnswer(
  prompt: string,
  history: BetaMessageParam[],
  onText: (text: string) => void,
): Promise<string> {
  const stream = anthropic.beta.messages.stream({
    ...requestBase("low"),
    max_tokens: 16000,
    messages: [...history, { role: "user", content: prompt }],
  });
  stream.on("text", onText);
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new AiError("A IA não conseguiu responder a esta pergunta.");
  }
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}
