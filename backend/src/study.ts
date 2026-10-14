import { z } from "zod";
import { complete, completeJson, generate } from "./ai";
import type { Lang } from "./i18n";
import {
  conceptsPrompt,
  flashcardsPrompt,
  partialSummaryPrompt,
  quizPrompt,
  studyContext,
  summaryPrompt,
} from "./prompts";
import { findReferenceForDocument, formatSources } from "./search";
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

// Por encima de esto, el resumen se hace por partes (map-reduce) para contener el coste.
const DIRECT_LIMIT = 60_000;
const PART_SIZE = 40_000;
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

async function condensedText(text: string, lang: Lang): Promise<string> {
  if (text.length <= DIRECT_LIMIT) return text;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += PART_SIZE) parts.push(text.slice(i, i + PART_SIZE));
  const partials = await Promise.all(
    parts.map((part, i) => complete(partialSummaryPrompt(lang, part, i + 1, parts.length), { lang, effort: "low" })),
  );
  return partials.map((p, i) => `## Parte ${i + 1}\n${p}`).join("\n\n");
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Genera (o devuelve de la caché) el material de estudio de un documento.
 * La caché no depende del idioma: si cambia de idioma, el frontend ofrece generarlo de nuevo.
 */
export async function getOrGenerateStudy(documentId: string, userId: string, lang: Lang, force = false) {
  if (!force) {
    const { data } = await supabase
      .from("study_materials")
      .select("*")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data;
  }

  // Evita generar dos veces el mismo documento si abre la página dos veces.
  const jobKey = `${documentId}:${lang}`;
  const running = inFlight.get(jobKey);
  if (running) return running;

  const job = (async () => {
    const text = await documentText(documentId, userId);
    if (!text.trim()) throw new Error("Documento sin texto");
    const source = await condensedText(text, lang);

    // Nivel 2: biblioteca de referencia relacionada (si la hay). Nivel 3: web, solo para el resumen
    // y solo si los apuntes son escasos y la referencia no tiene nada.
    const references = await findReferenceForDocument(userId, documentId).catch((err) => {
      console.error("Error al buscar en la referencia:", err);
      return [];
    });
    const refText = formatSources(references, lang);
    const webForSummary = text.length < SCARCE_NOTES && references.length === 0;
    const withRefs = (prompt: string) => prompt + studyContext(lang, refText, false);

    const [summaryResult, concepts, flashcards, quiz] = await Promise.all([
      generate(summaryPrompt(lang, source) + studyContext(lang, refText, webForSummary), {
        lang,
        web: webForSummary,
      }),
      completeJson(withRefs(conceptsPrompt(lang, source)), conceptsSchema, { lang }),
      completeJson(withRefs(flashcardsPrompt(lang, source)), flashcardsSchema, { lang }),
      completeJson(withRefs(quizPrompt(lang, source)), quizSchema, { lang }),
    ]);
    const summary = summaryResult.text;
    // Solo nombres y enlaces de las fuentes (nunca el texto de las páginas web).
    const sources = [
      ...references.map(({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s),
      ...summaryResult.webSources,
    ];

    const row = {
      document_id: documentId,
      user_id: userId,
      summary,
      key_concepts: concepts.key_concepts,
      glossary: concepts.glossary,
      flashcards: flashcards.flashcards,
      quiz: quiz.quiz,
      sources,
      lang,
      generated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("study_materials").upsert(row).select("*").single();
    if (error) throw error;

    if (force) {
      // Las tarjetas han cambiado: el historial de repasos anterior deja de tener sentido.
      await supabase.from("flashcard_reviews").delete().eq("document_id", documentId).eq("user_id", userId);
    }
    return data;
  })();

  inFlight.set(jobKey, job);
  try {
    return await job;
  } finally {
    inFlight.delete(jobKey);
  }
}
