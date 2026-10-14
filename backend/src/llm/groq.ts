import Groq from "groq-sdk";
import { config } from "../config";
import { classifyHttpError, type LlmRequest, type LlmResult, type Provider } from "./types";

/**
 * Groq (plan gratuito, modelos abiertos como GPT-OSS o Llama).
 * No tiene búsqueda web gratuita: con Groq la IA usa sus apuntes, la biblioteca de referencia
 * y su conocimiento general (marcado como "Fuera de tus apuntes").
 */
let client: Groq | null = null;
const groq = () => (client ??= new Groq({ apiKey: config.GROQ_API_KEY }));

/** Opciones de razonamiento según la familia del modelo (cada familia acepta parámetros distintos). */
function reasoningOptions(model: string, effort: LlmRequest["effort"]) {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: effort, include_reasoning: false };
  if (/qwen/i.test(model)) return { reasoning_format: "hidden" as const };
  return {};
}

export const groqProvider: Provider = {
  id: "groq",
  supportsWeb: false,
  async generate(model: string, req: LlmRequest): Promise<LlmResult> {
    const messages = [
      { role: "system" as const, content: req.system },
      { role: "user" as const, content: req.prompt },
    ];
    try {
      if (req.json) {
        // El modo JSON de Groq no funciona en streaming: pedimos la respuesta entera.
        const res = await groq().chat.completions.create({
          model,
          messages,
          max_completion_tokens: req.maxTokens,
          response_format: { type: "json_object" },
          ...reasoningOptions(model, req.effort),
        });
        const text = res.choices[0]?.message?.content ?? "";
        req.onText?.(text);
        return { text: text.trim(), webSources: [], webSearches: 0 };
      }
      const stream = await groq().chat.completions.create({
        model,
        messages,
        max_completion_tokens: req.maxTokens,
        stream: true,
        ...reasoningOptions(model, req.effort),
      });
      let text = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          text += delta;
          req.onText?.(delta);
        }
      }
      return { text: text.trim(), webSources: [], webSearches: 0 };
    } catch (err) {
      throw classifyHttpError(err, { usedWeb: false }) ?? err;
    }
  },
};
