import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { config } from "../config";
import { extractWebSources, finalAnswerText, RESEARCH_TOOLS, WEB_TOOLS } from "../web";
import { classifyHttpError, ProviderError, type LlmRequest, type LlmResult, type Provider } from "./types";

/**
 * Anthropic (Claude). Es de pago: solo se usa si se pone en AI_CHAIN y hay ANTHROPIC_API_KEY.
 * Su búsqueda web sí se puede limitar de verdad a radiopaedia.org, iaea.org y efrs.eu.
 */
let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }));

// Modelos que aceptan el "fallback" del lado del servidor: si la petición se rechaza
// por un falso positivo de los filtros de seguridad, la API prueba con otro modelo.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

// La API puede "pausar" una pregunta durante búsquedas largas; la reanudamos como máximo 3 veces.
const MAX_CONTINUATIONS = 3;

export const anthropicProvider: Provider = {
  id: "anthropic",
  supportsWeb: true,
  paid: true,
  supportsImages: true,
  async generate(model: string, req: LlmRequest): Promise<LlmResult> {
    const messages: BetaMessageParam[] = [
      {
        role: "user",
        content: req.images?.length
          ? [
              ...req.images.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
              })),
              { type: "text" as const, text: req.prompt },
            ]
          : req.prompt,
      },
    ];
    const content: BetaContentBlock[] = [];
    let webSearches = 0;
    // Si el buscador web de Anthropic falla (p. ej., "demasiadas peticiones"), se corta la respuesta antes de que
    // la IA se ponga a contarle el problema a ella y se repite sin búsqueda web (ver "noWeb" en ai.ts).
    let searchError: string | null = null;
    try {
      for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
        const stream = anthropic().beta.messages.stream({
          model,
          system: req.system,
          output_config: { effort: req.effort },
          ...(FALLBACK_MODELS.has(model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
          max_tokens: req.maxTokens,
          messages,
          ...(req.web ? { tools: req.research ? RESEARCH_TOOLS : WEB_TOOLS } : {}),
        });
        if (req.onText) stream.on("text", req.onText);
        stream.on("streamEvent", (event) => {
          if (event.type !== "content_block_start") return;
          const block = event.content_block as { type: string; name?: string; content?: { type?: string; error_code?: string } };
          if (block.type === "server_tool_use" && (block.name === "web_search" || block.name === "web_fetch"))
            req.onWebTool?.(block.name);
          if (block.type === "web_search_tool_result" && block.content?.type === "web_search_tool_result_error") {
            searchError = block.content.error_code ?? "unknown";
            stream.abort();
          }
        });
        const message = await stream.finalMessage().catch((err) => {
          if (searchError) throw new ProviderError("noWeb", `Búsqueda web de Anthropic: ${searchError}`, 2 * 60_000);
          throw err;
        });
        if (message.stop_reason === "refusal") throw new ProviderError("refused", "Claude ha rechazado la petición");
        content.push(...message.content);
        webSearches += message.usage.server_tool_use?.web_search_requests ?? 0;

        if (message.stop_reason === "pause_turn") {
          // La API ha pausado la búsqueda: le devolvemos la respuesta parcial tal cual para que continúe.
          messages.push({ role: "assistant", content: message.content as BetaContentBlockParam[] });
          continue;
        }
        break;
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw classifyHttpError(err, { usedWeb: req.web }) ?? err;
    }
    return {
      text: req.web
        ? finalAnswerText(content)
        : content
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
            .trim(),
      webSources: req.web ? extractWebSources(content, req.research) : [],
      webSearches,
    };
  },
};
