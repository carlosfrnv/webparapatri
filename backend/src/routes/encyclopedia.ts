import { Router } from "express";
import { z } from "zod";
import { generate } from "../ai";
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

const prompt = (q: string, lang: "es" | "pt", web: boolean) => {
  const pt = lang === "pt";
  return `Una estudiante de 1.º de Imagen Médica y Radioterapia busca en su enciclopedia de radiología: «${q}».
${
  web
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
    // Búsqueda web solo con la IA gratuita (con Claude se paga cada búsqueda).
    const result = await generate((web) => prompt(q, lang, web), {
      lang,
      effort: "low",
      maxTokens: 3000,
      web: WEB_ENABLED,
      paidWeb: false,
    });
    const text = result.text.trim();
    const [head, ...rest] = text.split(/^===\s*$/m);
    const title = head.match(/^TITULO:\s*(.+)$/im)?.[1]?.trim() || q;
    const en = head.match(/^EN:\s*(.+)$/im)?.[1]?.trim() || q;
    const body = (rest.length ? rest.join("===") : text.replace(/^(TITULO|EN):.*$/gim, "")).trim();
    const sources = result.webSources.filter((s) => /radiopaedia/i.test(s.site)).slice(0, 4);
    const entry: Entry = {
      title: title.slice(0, 160),
      en: en.slice(0, 160),
      body: body.slice(0, 8000),
      sources,
      search_url: `https://radiopaedia.org/search?lang=us&q=${encodeURIComponent(en)}&scope=articles`,
      from_radiopaedia: sources.length > 0,
    };
    if (cache.size > 1000) cache.clear();
    cache.set(key, entry);
    res.json(entry);
  }),
);
