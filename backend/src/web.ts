import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";

/**
 * NIVEL 3: consulta en vivo a radiopaedia.org, iaea.org y efrs.eu.
 *
 * Usa las herramientas de servidor de la API de Anthropic (las ejecuta la propia API):
 *  - web_search: búsqueda, limitada a estos tres dominios y a 3 búsquedas por pregunta.
 *  - web_fetch: lee una página encontrada en la búsqueda (solo puede abrir URL que ya hayan salido
 *    en los resultados), con un límite de tamaño para controlar el coste.
 * Los subdominios se incluyen automáticamente (p. ej., www-pub.iaea.org).
 *
 * El texto de las páginas NUNCA se guarda: solo se usa para responder en ese momento.
 * Guardamos únicamente el nombre y el enlace de las fuentes (para los chips) y la respuesta generada.
 */
export const WEB_DOMAINS = ["radiopaedia.org", "iaea.org", "efrs.eu"];
export const WEB_MAX_SEARCHES = 3;

export const WEB_TOOLS = [
  {
    type: "web_search_20260318" as const,
    name: "web_search" as const,
    allowed_domains: WEB_DOMAINS,
    max_uses: WEB_MAX_SEARCHES,
  },
  {
    type: "web_fetch_20260318" as const,
    name: "web_fetch" as const,
    allowed_domains: WEB_DOMAINS,
    max_uses: 3,
    max_content_tokens: 15000,
  },
];

export type WebSite = "Radiopaedia" | "IAEA" | "EFRS";

export interface WebSource {
  kind: "web";
  site: WebSite;
  title: string;
  url: string;
}

export function siteOf(url: string): WebSite | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "radiopaedia.org" || host.endsWith(".radiopaedia.org")) return "Radiopaedia";
    if (host === "iaea.org" || host.endsWith(".iaea.org")) return "IAEA";
    if (host === "efrs.eu" || host.endsWith(".efrs.eu")) return "EFRS";
  } catch {
    /* URL no válida */
  }
  return null;
}

/** "Hounsfield unit | Radiology Reference Article | Radiopaedia.org" → "Hounsfield unit" */
function cleanTitle(title: string | null | undefined, url: string): string {
  const base = (title ?? "").split(/\s+[|–—]\s+/)[0].trim();
  if (base) return base.slice(0, 90);
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last).replace(/[-_]/g, " ").slice(0, 90) || url;
  } catch {
    return url;
  }
}

/**
 * Fuentes web usadas de verdad: las citadas en el texto de la respuesta y las páginas leídas con web_fetch.
 * (Los resultados de búsqueda que la IA no ha usado no aparecen.)
 */
export function extractWebSources(content: BetaContentBlock[]): WebSource[] {
  const found = new Map<string, WebSource>();
  const add = (url: string, title: string | null | undefined) => {
    const site = siteOf(url);
    if (!site || found.has(url)) return;
    found.set(url, { kind: "web", site, url, title: cleanTitle(title, url) });
  };
  for (const block of content) {
    if (block.type === "text") {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") add(c.url, c.title);
      }
    } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      add(block.content.url, block.content.content.title);
    }
  }
  return [...found.values()].slice(0, 6);
}

/** Texto final de la respuesta: solo lo que viene después de la última búsqueda/lectura (sin preámbulos). */
export function finalAnswerText(content: BetaContentBlock[]): string {
  let lastTool = -1;
  content.forEach((b, i) => {
    if (b.type === "server_tool_use" || b.type === "web_search_tool_result" || b.type === "web_fetch_tool_result") {
      lastTool = i;
    }
  });
  return content
    .slice(lastTool + 1)
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}
