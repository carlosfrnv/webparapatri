import { z } from "zod";
import { AiError, complete, completeJson, generate } from "./ai";
import type { Lang } from "./i18n";
import { partialSummaryPrompt, studyContext, studyPackPrompt, summaryPrompt, translateStudyPrompt } from "./prompts";
import { isFormulaDocument } from "./formulas";
import { findReferenceForDocument, formatSources } from "./search";
import { WEB_ENABLED } from "./web";
import { supabase } from "./supabase";

export const conceptsSchema = z.object({
  key_concepts: z.array(z.object({ concept: z.string(), explanation: z.string(), why_it_matters: z.string() })),
  glossary: z.array(z.object({ term: z.string(), definition: z.string() })),
});

export const flashcardsSchema = z.object({
  flashcards: z.array(z.object({ front: z.string(), back: z.string() })).min(1),
});

export const quizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string(),
});

export const quizSchema = z.object({ quiz: z.array(quizQuestionSchema).min(1) });

/** Conceptos, glosario, flashcards y test en una sola respuesta JSON. */
export const studyPackSchema = conceptsSchema.and(flashcardsSchema).and(quizSchema);

// Por encima de esto, el resumen se hace por partes (map-reduce) para contener el coste.
const DIRECT_LIMIT = 200_000;
const PART_SIZE = 150_000;
// Por debajo de esto consideramos que los apuntes son "escasos" y el resumen puede consultar la web (nivel 3).
const SCARCE_NOTES = 2_500;

export async function documentText(documentId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("chunks")
    .select("content, position")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("position");
  if (error) throw error;

  // Los fragmentos se solapan ~200 caracteres; para el resumen no importa.
  return (data ?? []).map((c) => c.content).join("\n\n");
}

async function condensedText(text: string, lang: Lang, formulas = false): Promise<string> {
  if (text.length <= DIRECT_LIMIT) return text;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += PART_SIZE) parts.push(text.slice(i, i + PART_SIZE));
  const partials = await Promise.all(
    parts.map((part, i) =>
      complete(partialSummaryPrompt(lang, part, i + 1, parts.length, formulas), { lang, effort: "low" }),
    ),
  );
  return partials.map((p, i) => `## Parte ${i + 1}\n${p}`).join("\n\n");
}

const inFlight = new Map<string, Promise<unknown>>();

const TRANSLATED_FIELDS = ["summary", "key_concepts", "glossary", "flashcards", "quiz"] as const;
const translatedSchema = z.object({ summary: z.string().min(1) }).and(studyPackSchema);

interface StudyRow {
  lang: Lang | null;
  translations?: Partial<Record<Lang, Record<string, unknown>>> | null;
  [key: string]: unknown;
}

/** El material en el idioma pedido: el original o su traducción guardada. Null si aún no está traducido. */
// Etiquetas de origen entre corchetes ("[Tus apuntes]", "[Biblioteca de referencia – IAEA]"…). En el resumen
// la web las convierte en sellos, pero en conceptos, glosario, flashcards y tests saldrían como texto: se quitan.
const ORIGIN_LABEL =
  /\[(?:Os teus apontamentos|Tus apuntes|Biblioteca de refer[eê]ncia[^\]]*|Radiopaedia|IAEA|EFRS)\]\s*/g;
const clean = (v: unknown): unknown =>
  typeof v === "string"
    ? v.replace(ORIGIN_LABEL, "").trim()
    : Array.isArray(v)
      ? v.map(clean)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]))
        : v;
const PLAIN_FIELDS = ["key_concepts", "glossary", "flashcards", "quiz"] as const;

function withoutLabels<T extends Record<string, unknown>>(m: T): T {
  const out: Record<string, unknown> = { ...m };
  for (const f of PLAIN_FIELDS) if (f in out) out[f] = clean(out[f]);
  return out as T;
}

export function materialInLang<T extends StudyRow>(row: T, lang: Lang): Omit<T, "translations"> | null {
  const { translations, ...rest } = row;
  if ((row.lang ?? "es") === lang) return withoutLabels(rest);
  const tr = translations?.[lang];
  return tr ? withoutLabels({ ...rest, ...tr, lang }) : null;
}

/**
 * Traduce el material ya generado al otro idioma y lo guarda junto al original. Mismas tarjetas
 * y preguntas en el mismo orden: el progreso de las flashcards sirve para los dos idiomas.
 */
async function translateStudy(row: StudyRow, userId: string, lang: Lang) {
  const original = Object.fromEntries(TRANSLATED_FIELDS.map((f) => [f, row[f]]));
  const tr = await completeJson(translateStudyPrompt(lang, JSON.stringify(original)), translatedSchema, {
    lang,
    effort: "low",
    maxTokens: 32000,
  });
  const same = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length;
  if (!same(tr.flashcards, row.flashcards) || !same(tr.quiz, row.quiz)) throw new AiError("aiBadFormat");
  const translations = { ...(row.translations ?? {}), [lang]: tr };
  const { error } = await supabase
    .from("study_materials")
    .update({ translations })
    .eq("document_id", row.document_id as string)
    .eq("user_id", userId);
  if (error) throw error;
  return materialInLang({ ...row, translations }, lang)!;
}

/**
 * Genera (o devuelve de la caché) el material de estudio de un documento en el idioma pedido.
 * Se genera una vez; el otro idioma se obtiene traduciéndolo la primera vez que se pide y se guarda.
 */
export async function getOrGenerateStudy(documentId: string, userId: string, lang: Lang, force = false) {
  if (!force) {
    const { data } = await supabase
      .from("study_materials")
      .select("*")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      const ready = materialInLang(data as StudyRow, lang);
      if (ready) return ready;
      const key = `${documentId}:${lang}:tr`;
      const pending = inFlight.get(key) ?? translateStudy(data as StudyRow, userId, lang);
      inFlight.set(key, pending);
      try {
        return await pending;
      } finally {
        inFlight.delete(key);
      }
    }
  }

  // Evita generar dos veces el mismo documento si abre la página dos veces.
  const jobKey = `${documentId}:${lang}`;
  const running = inFlight.get(jobKey);
  if (running) return running;

  const job = (async () => {
    const text = await documentText(documentId, userId);
    if (!text.trim()) throw new Error("Documento sin texto");
    const formulas = await isFormulaDocument(documentId, userId).catch(() => false);
    const source = await condensedText(text, lang, formulas);

    // Nivel 2: biblioteca de referencia relacionada (si la hay). Nivel 3: web, solo para el resumen
    // y solo si los apuntes son escasos y la referencia no tiene nada.
    const references = await findReferenceForDocument(userId, documentId).catch((err) => {
      console.error("Error al buscar en la referencia:", err);
      return [];
    });
    const refText = formatSources(references, lang);
    const webForSummary = WEB_ENABLED && text.length < SCARCE_NOTES && references.length === 0;

    // Dos peticiones en total: el resumen y el "paquete" de conceptos, glosario, flashcards y test.
    const [summaryResult, pack] = await Promise.all([
      generate((webAvailable) => summaryPrompt(lang, source, formulas) + studyContext(lang, refText, webAvailable), {
        lang,
        web: webForSummary,
      }),
      completeJson(studyPackPrompt(lang, source, formulas) + studyContext(lang, refText, false), studyPackSchema, {
        lang,
        maxTokens: 24000,
      }),
    ]);
    const summary = summaryResult.text;
    // Solo nombres y enlaces de las fuentes (nunca el texto de las páginas web). Si el resumen
    // ha usado la búsqueda de Google, guardamos también sus "sugerencias de búsqueda" para mostrarlas.
    const sources = [
      ...references.map(({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s),
      ...summaryResult.webSources,
      ...(summaryResult.searchSuggestionsHtml
        ? [{ kind: "search_suggestions" as const, html: summaryResult.searchSuggestionsHtml }]
        : []),
    ];

    const row = {
      document_id: documentId,
      user_id: userId,
      summary,
      key_concepts: pack.key_concepts,
      glossary: pack.glossary,
      flashcards: pack.flashcards,
      quiz: pack.quiz,
      sources,
      lang,
      // Material nuevo: las traducciones anteriores ya no corresponden.
      translations: null,
      generated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("study_materials").upsert(row).select("*").single();
    if (error) throw error;

    if (force) {
      // Las tarjetas han cambiado: el historial de repasos anterior deja de tener sentido.
      await supabase.from("flashcard_reviews").delete().eq("document_id", documentId).eq("user_id", userId);
      // Y las preguntas falladas apuntaban a las preguntas del test anterior.
      await supabase.from("quiz_mistakes").delete().eq("document_id", documentId).eq("user_id", userId);
    }
    return materialInLang(data as StudyRow, lang) ?? data;
  })();

  inFlight.set(jobKey, job);
  try {
    return await job;
  } finally {
    inFlight.delete(jobKey);
  }
}
