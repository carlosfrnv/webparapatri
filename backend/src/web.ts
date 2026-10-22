import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { config } from "./config";

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
// Se configura con la variable WEB_MAX_SEARCHES (por defecto 3; 0 desactiva la consulta online).
export const WEB_MAX_SEARCHES = config.WEB_MAX_SEARCHES;
export const WEB_ENABLED = WEB_MAX_SEARCHES > 0;

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

/**
 * Modo trabajo (cuando prepara un trabajo y pide fuentes): búsqueda abierta en cualquier web, con más búsquedas.
 * El prompt le pide fuentes fiables (artículos científicos, sociedades, organismos oficiales, hospitales, universidades).
 */
// Con Claude cada búsqueda y cada página leída se paga (y todo lo leído cuenta como texto de entrada):
// pocas y recortadas bastan para un apartado.
export const RESEARCH_MAX_SEARCHES = 4;
export const RESEARCH_TOOLS = [
  { type: "web_search_20260318" as const, name: "web_search" as const, max_uses: RESEARCH_MAX_SEARCHES },
  { type: "web_fetch_20260318" as const, name: "web_fetch" as const, max_uses: 2, max_content_tokens: 4000 },
];

/** Nombre que se enseña en el chip de la fuente (Radiopaedia, IAEA, PubMed… o el dominio). */
export type WebSite = string;

export interface WebSource {
  kind: "web";
  site: WebSite;
  title: string;
  url: string;
}

const KNOWN_SITES: [RegExp, string][] = [
  [/(^|\.)radiopaedia\.org$/, "Radiopaedia"],
  [/(^|\.)iaea\.org$/, "IAEA"],
  [/(^|\.)efrs\.eu$/, "EFRS"],
  [/(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/, "PubMed"],
  [/(^|\.)ncbi\.nlm\.nih\.gov$/, "NCBI / PMC"],
  [/(^|\.)scielo\./, "SciELO"],
  [/(^|\.)rcaap\.pt$/, "RCAAP"],
  [/(^|\.)eanm\.org$/, "EANM"],
  [/(^|\.)snmmi\.org$/, "SNMMI"],
  [/(^|\.)who\.int$/, "OMS"],
  [/(^|\.)dgs\.pt$/, "DGS"],
  [/(^|\.)sns\.gov\.pt$/, "SNS"],
  [/(^|\.)uc\.pt$/, "Universidade de Coimbra"],
  [/(^|\.)ipolisboa\.min-saude\.pt$/, "IPO Lisboa"],
  [/(^|\.)spmn\.pt$/, "SPMN"],
  [/(^|\.)doi\.org$/, "DOI"],
  [/(^|\.)sciencedirect\.com$/, "ScienceDirect"],
  [/(^|\.)springer(link)?\.com$/, "Springer"],
  [/(^|\.)wikipedia\.org$/, "Wikipedia"],
];

/** Nombre de la web de una URL. Sin `open`, solo las tres webs del nivel 3 (Radiopaedia, IAEA, EFRS). */
export function siteOf(url: string, open = false): WebSite | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const known = KNOWN_SITES.find(([re]) => re.test(host))?.[1];
    if (!open) return known && ["Radiopaedia", "IAEA", "EFRS"].includes(known) ? known : null;
    return known ?? host;
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
export function extractWebSources(content: BetaContentBlock[], open = false): WebSource[] {
  const found = new Map<string, WebSource>();
  const add = (url: string, title: string | null | undefined) => {
    const site = siteOf(url, open);
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
  return [...found.values()].slice(0, open ? 15 : 6);
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
