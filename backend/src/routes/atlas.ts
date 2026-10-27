import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { completeJson } from "../ai";
import { asyncHandler, HttpError } from "../http";
import { aiLimiter } from "../limits";
import { supabase } from "../supabase";

/**
 * Atlas "en mis apuntes": de los nombres de las piezas del atlas (en español y portugués),
 * cuáles aparecen en los apuntes de una asignatura. No gasta IA: es una búsqueda de texto.
 */
export const atlasRouter = Router();

const bodySchema = z.object({
  subject_id: z.string().uuid(),
  parts: z.array(z.object({ key: z.string().min(1).max(200), terms: z.array(z.string().max(200)).max(4) })).max(3000),
});

const MAX_WORDS = 5;
const MIN_LENGTH = 4;
// Palabras sueltas demasiado generales para contar como mención de una pieza.
const GENERIC = new Set(["nariz", "lengua", "lingua", "pleura", "iris", "lente", "retina"]);

/** Minúsculas, sin tildes y solo letras/números separados por un espacio. */
export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Nombre de la pieza preparado para buscar: sin lo que va entre paréntesis ("(porción acromial)", "(II)"). */
export const searchTerm = (name: string) => normalizeText(name.replace(/\([^)]*\)/g, " "));

/** Todos los grupos de 1 a 5 palabras seguidas del texto (así se busca cada nombre de una vez). */
export function phrasesOf(text: string) {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    let phrase = "";
    for (let n = 0; n < MAX_WORDS && i + n < words.length; n++) {
      phrase = n === 0 ? words[i] : `${phrase} ${words[i + n]}`;
      set.add(phrase);
    }
  }
  return set;
}

export function matchParts(phrases: Set<string>, parts: { key: string; terms: string[] }[]) {
  const found: string[] = [];
  for (const p of parts) {
    const hit = p.terms.some((t) => {
      const term = searchTerm(t);
      if (term.length < MIN_LENGTH || GENERIC.has(term) || term.split(" ").length > MAX_WORDS) return false;
      // Plural sencillo ("costillas", "vértebras") también cuenta.
      return phrases.has(term) || phrases.has(`${term}s`) || phrases.has(`${term}es`);
    });
    if (hit) found.push(p.key);
  }
  return found;
}

atlasRouter.post(
  "/mentions",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { subject_id, parts } = bodySchema.parse(req.body);
    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", subject_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!subject) throw new HttpError(404, "invalidSubject");

    const { data: docs, error } = await supabase
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("subject_id", subject_id)
      .eq("source_type", "apuntes")
      .eq("status", "ready");
    if (error) throw error;
    const ids = (docs ?? []).map((d) => d.id);

    const phrases = new Set<string>();
    for (let from = 0; ids.length > 0; from += 1000) {
      const { data: chunks, error: e2 } = await supabase
        .from("chunks")
        .select("content")
        .eq("user_id", userId)
        .in("document_id", ids)
        .order("id")
        .range(from, from + 999);
      if (e2) throw e2;
      for (const c of chunks ?? []) for (const ph of phrasesOf(c.content)) phrases.add(ph);
      if (!chunks || chunks.length < 1000) break;
    }
    res.json({ documents: ids.length, found: matchParts(phrases, parts) });
  }),
);

// ---------- Ficha de una estructura (como en los atlas: función, localización, tamaño, irrigación…) ----------

const infoSchema = z.object({
  en: z.string().trim().min(2).max(200), // nombre anatómico en inglés (Z-Anatomy)
  name: z.string().trim().min(2).max(200), // nombre en el idioma de la web
  lang: z.enum(["es", "pt"]),
});
const infoOut = z.object({
  funcion: z.string().max(600),
  localizacion: z.string().max(600),
  tamano: z.string().max(300).default(""),
  irrigacion: z.string().max(400).default(""),
  inervacion: z.string().max(400).default(""),
  tejido: z.string().max(300).default(""),
  imagen: z.string().max(600).default(""),
  dato: z.string().max(400).default(""),
});
// La anatomía no cambia: se guarda en memoria para no gastar IA dos veces en la misma pieza.
const infoCache = new Map<string, z.infer<typeof infoOut>>();

atlasRouter.post(
  "/info",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { en, name, lang } = infoSchema.parse(req.body);
    const key = `${lang}:${en.toLowerCase()}`;
    const hit = infoCache.get(key);
    if (hit) return void res.json(hit);
    const pt = lang === "pt";
    const out = await completeJson(
      `Ficha de anatomía para una estudiante de 1.º de Imagen Médica y Radioterapia, como la de un atlas.
Estructura: «${name}» (nombre anatómico en inglés: ${en}).
Escribe en ${pt ? "portugués europeo" : "español de España"}, frases cortas y claras, con datos anatómicos estándar y seguros
(si un campo no aplica a esta estructura, déjalo vacío; no inventes cifras: da valores aproximados solo si son los habituales
de los libros, p. ej. "unos 1,3-1,4 kg en el adulto").
Campos:
- funcion: para qué sirve (1-2 frases).
- localizacion: dónde está y con qué se relaciona (1-2 frases).
- tamano: tamaño o peso aproximado en el adulto, si tiene sentido.
- irrigacion: arterias principales (y venas si es relevante).
- inervacion: nervios principales, si aplica.
- tejido: tipo de tejido u órgano (p. ej., hueso largo, músculo esquelético, órgano parenquimatoso).
- imagen: cómo se ve o se estudia en imagen médica (RX, TC, RM, ecografía, medicina nuclear), 1-2 frases.
- dato: un dato curioso o un truco para recordarlo (1 frase).
Responde SOLO con JSON: {"funcion":"","localizacion":"","tamano":"","irrigacion":"","inervacion":"","tejido":"","imagen":"","dato":""}`,
      infoOut,
      { lang, effort: "low", maxTokens: 1500 },
    );
    if (infoCache.size > 2000) infoCache.clear();
    infoCache.set(key, out);
    res.json(out);
  }),
);
