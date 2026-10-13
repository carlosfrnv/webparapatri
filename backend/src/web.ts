import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";

/**
 * NÍVEL 3: consulta em direto a radiopaedia.org, iaea.org e efrs.eu.
 *
 * Usa as ferramentas de servidor da API da Anthropic (executadas pela própria API):
 *  - web_search: pesquisa, limitada a estes três domínios e a 3 pesquisas por pergunta.
 *  - web_fetch: lê uma página encontrada na pesquisa (só pode abrir URLs que já apareceram
 *    nos resultados), com um limite de tamanho para controlar o custo.
 * Os subdomínios estão incluídos automaticamente (ex.: www-pub.iaea.org).
 *
 * O texto das páginas NUNCA é guardado: só se usa para responder naquele momento.
 * Guardamos apenas o nome e o endereço das fontes (para os chips) e a resposta gerada.
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
    /* URL inválido */
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
 * Fontes web efetivamente usadas: as citadas no texto da resposta e as páginas lidas com web_fetch.
 * (Os resultados de pesquisa que a IA não usou não aparecem.)
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

/** Texto final da resposta: só o que vem depois da última pesquisa/leitura (sem preâmbulos). */
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
