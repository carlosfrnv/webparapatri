import { Router } from "express";
import { z } from "zod";
import { completeJson, generate } from "../ai";
import { asyncHandler } from "../http";
import { aiLimiter } from "../limits";
import { WEB_ENABLED, type WebSource } from "../web";

/**
 * Sección "Radiopaedia": ficha de un tema de radiología en su idioma, hecha a partir de Radiopaedia (con la búsqueda web
 * gratuita), con enlace al artículo original. Radiopaedia no se copia: la ficha es un resumen propio con la fuente.
 */
export const encyclopediaRouter = Router();

const bodySchema = z.object({
  q: z.string().trim().min(2).max(120),
  lang: z.enum(["es", "pt"]),
});

interface Entry {
  title: string;
  en: string;
  body: string;
  sources: WebSource[];
  search_url: string;
  from_radiopaedia: boolean;
}

// Los temas no cambian: se guardan en memoria para no repetir la búsqueda.
const cache = new Map<string, Entry>();

const RP = "https://radiopaedia.org";
const html = async (url: string) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; EstudioIMR/1.0)", accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Radiopaedia ${res.status}`);
  return res.text();
};
const decode = (t: string) =>
  t
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * El artículo de Radiopaedia sobre un término en inglés: se busca en Radiopaedia y se lee el texto del primer artículo
 * (sin imágenes). Si Radiopaedia no responde, null y la ficha se hace de otra forma.
 */
async function radiopaediaArticle(en: string) {
  try {
    const search = await html(`${RP}/search?lang=us&q=${encodeURIComponent(en)}&scope=articles`);
    const slug = search.match(/href="(\/articles\/[a-z0-9-]+)(?:\?[^"]*)?"/i)?.[1];
    if (!slug) return null;
    const page = await html(`${RP}${slug}?lang=us`);
    const title = decode(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
    // El texto del artículo va en el bloque "user-generated-content" (fuera quedan menús y anuncios).
    const start = page.search(/class="[^"]*user-generated-content/);
    const body = start >= 0 ? page.slice(start) : page;
    const parts = [...body.matchAll(/<(h2|h3|h4|h5|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((m) => (m[1].toLowerCase().startsWith("h") ? `## ${decode(m[2])}` : decode(m[2])))
      .filter((t) => t.length > 2);
    // Se corta antes de las referencias y de los casos.
    const end = parts.findIndex((t) => /^## (references|cases and figures|related articles|quiz questions)/i.test(t));
    const text = (end > 0 ? parts.slice(0, end) : parts).join("\n").slice(0, 14000);
    if (text.length < 300) return null;
    return { url: `${RP}${slug}`, title: title || en, text };
  } catch (err) {
    console.warn("[radiopaedia] no se ha podido leer:", String(err).slice(0, 200));
    return null;
  }
}

const prompt = (q: string, lang: "es" | "pt", web: boolean, article?: { title: string; text: string }) => {
  const pt = lang === "pt";
  return `Una estudiante de 1.º de Imagen Médica y Radioterapia busca en su enciclopedia de radiología: «${q}».
${
  article
    ? `Haz la ficha a partir de este artículo de Radiopaedia («${article.title}»), sin añadir datos que no estén en él:
${article.text}`
    : web
      ? `Busca el artículo de Radiopaedia sobre ese tema (búsqueda: "site:radiopaedia.org ${q}", en inglés si hace falta) y
haz la ficha a partir de él. Usa solo radiopaedia.org.`
      : "Ahora no puedes buscar en internet: haz la ficha con conocimientos de radiología estándar y seguros."
}
Escribe en ${pt ? "portugués europeo" : "español de España"}, claro y para su nivel, con el nombre de los signos y técnicas como se usan
en clase. No copies frases enteras: explícalo con tus palabras. Si el término no es de radiología o anatomía, dilo en una frase.
FORMATO EXACTO:
TITULO: <nombre del tema en ${pt ? "portugués" : "español"}>
EN: <nombre en inglés, como en Radiopaedia>
===
### ${pt ? "O que é" : "Qué es"}
(2-3 frases)
### ${pt ? "Como se vê em imagem" : "Cómo se ve en imagen"}
(viñetas por técnica que aplique: RX, TC, RM, ecografía, medicina nuclear)
### ${pt ? "Sinais-chave" : "Signos clave"}
(viñetas)
### ${pt ? "Diagnóstico diferencial" : "Diagnóstico diferencial"}
(viñetas, si aplica)
### ${pt ? "Para o exame" : "Para el examen"}
(2-3 viñetas con lo que más se pregunta o un truco para recordarlo)`;
};

encyclopediaRouter.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { q, lang } = bodySchema.parse(req.body);
    const key = `${lang}:${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit) return void res.json(hit);
    // 1) El artículo, leído directamente de Radiopaedia (con el nombre en inglés, que es como está allí).
    const term = await completeJson(
      `Nombre en inglés, tal y como lo usaría Radiopaedia, del tema de radiología o anatomía «${q}». Responde SOLO con JSON: {"en":"..."}`,
      z.object({ en: z.string().trim().min(2).max(120) }),
      { lang, effort: "low", maxTokens: 300 },
    ).catch(() => ({ en: q }));
    const article = await radiopaediaArticle(term.en);
    // 2) La ficha: a partir del artículo; si no se ha podido leer, con la búsqueda web de la IA gratuita
    //    (con Claude se paga cada búsqueda).
    const result = await generate((web) => prompt(q, lang, web, article ?? undefined), {
      lang,
      effort: "low",
      maxTokens: 3000,
      web: !article && WEB_ENABLED,
      paidWeb: false,
    });
    const text = result.text.trim();
    const [head, ...rest] = text.split(/^===\s*$/m);
    const title = head.match(/^TITULO:\s*(.+)$/im)?.[1]?.trim() || q;
    const en = head.match(/^EN:\s*(.+)$/im)?.[1]?.trim() || article?.title || term.en;
    const body = (rest.length ? rest.join("===") : text.replace(/^(TITULO|EN):.*$/gim, "")).trim();
    const sources: WebSource[] = article
      ? [{ kind: "web", site: "Radiopaedia", title: article.title, url: article.url }]
      : result.webSources.filter((s) => /radiopaedia/i.test(s.site)).slice(0, 4);
    const entry: Entry = {
      title: title.slice(0, 160),
      en: en.slice(0, 160),
      body: body.slice(0, 8000),
      sources,
      search_url: `https://radiopaedia.org/search?lang=us&q=${encodeURIComponent(en)}&scope=articles`,
      from_radiopaedia: sources.length > 0,
    };
    // Solo se guarda si salió de Radiopaedia (si no, la próxima vez se vuelve a intentar).
    if (cache.size > 1000) cache.clear();
    if (entry.from_radiopaedia) cache.set(key, entry);
    res.json(entry);
  }),
);
