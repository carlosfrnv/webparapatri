import { GoogleGenAI, type GroundingMetadata } from "@google/genai";
import { config } from "../config";
import { siteOf, type WebSource } from "../web";
import { classifyHttpError, ProviderError, type LlmRequest, type LlmResult, type Provider } from "./types";

/**
 * Google Gemini (plan gratuito de Google AI Studio).
 * La búsqueda web usa la "búsqueda con Google" integrada en Gemini. No permite limitar los dominios,
 * así que se le pide en el prompt que busque solo en Radiopaedia, IAEA y EFRS y aquí se descartan
 * como fuentes las páginas de otros sitios.
 */
let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }));

// Motivos de parada que significan que Gemini se ha negado a responder.
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/** Quita los operadores "site:" de una búsqueda para usarla como título del chip. */
function cleanQuery(q: string): string {
  return q
    .replace(/\bsite:\S+/gi, "")
    .replace(/\bOR\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function webSourcesFrom(meta: GroundingMetadata | undefined): WebSource[] {
  if (!meta) return [];
  const query = cleanQuery(meta.webSearchQueries?.[0] ?? "");
  const found = new Map<string, WebSource>();
  for (const chunk of meta.groundingChunks ?? []) {
    const web = chunk.web;
    if (!web?.uri) continue;
    // Gemini devuelve un enlace de redirección de Google; el título suele ser el dominio de la página.
    const site = siteOf(web.uri) ?? siteOf(`https://${web.title ?? ""}`);
    if (!site) continue; // solo Radiopaedia, IAEA y EFRS
    const looksLikeDomain = !web.title || /^[\w.-]+\.[a-z]{2,}$/i.test(web.title.trim());
    const title = looksLikeDomain ? query || site : web.title!.split(/\s+[|–—]\s+/)[0].trim();
    const key = `${site}|${title}`;
    if (!found.has(key)) found.set(key, { kind: "web", site, title: title.slice(0, 90), url: web.uri });
  }
  return [...found.values()].slice(0, 6);
}

export const gemini: Provider = {
  id: "gemini",
  supportsWeb: true,
  async generate(model: string, req: LlmRequest): Promise<LlmResult> {
    if (req.web) req.onWebTool?.("web_search");
    let text = "";
    let meta: GroundingMetadata | undefined;
    let blocked = false;
    try {
      const stream = await ai().models.generateContentStream({
        model,
        contents: req.prompt,
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxTokens,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
          ...(req.web ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      for await (const chunk of stream) {
        const candidate = chunk.candidates?.[0];
        if (chunk.promptFeedback?.blockReason || (candidate?.finishReason && BLOCKED.has(candidate.finishReason))) {
          blocked = true;
        }
        const parts = candidate?.content?.parts ?? [];
        // Solo el texto de la respuesta (no el razonamiento interno del modelo).
        const delta = parts.map((p) => (p.text && !p.thought ? p.text : "")).join("");
        if (delta) {
          text += delta;
          req.onText?.(delta);
        }
        if (candidate?.groundingMetadata) meta = candidate.groundingMetadata;
      }
    } catch (err) {
      throw classifyHttpError(err, { usedWeb: req.web }) ?? err;
    }
    if (blocked && !text.trim()) throw new ProviderError("refused", "Gemini ha bloqueado la respuesta");
    return {
      text: text.trim(),
      webSources: webSourcesFrom(meta),
      webSearches: meta?.webSearchQueries?.length ?? 0,
      searchSuggestionsHtml: meta?.searchEntryPoint?.renderedContent || undefined,
    };
  },
};
