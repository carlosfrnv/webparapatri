import { z } from "zod";
import { complete, completeJson } from "./ai";
import type { Lang } from "./i18n";
import { conceptsPrompt, flashcardsPrompt, partialSummaryPrompt, quizPrompt, summaryPrompt } from "./prompts";
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

// Acima disto, o resumo é feito por partes (map-reduce) para conter o custo.
const DIRECT_LIMIT = 60_000;
const PART_SIZE = 40_000;

export async function documentText(documentId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("chunks")
    .select("content, position")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("position");
  if (error) throw error;

  // Os fragmentos sobrepõem-se ~200 caracteres; para o resumo isso não faz mal.
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
 * Gera (ou devolve em cache) os materiais de estudo de um documento.
 * A cache não depende do idioma: se ela mudar de idioma, o frontend oferece gerar de novo.
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

  // Evita gerar duas vezes o mesmo documento se ela abrir a página duas vezes.
  const jobKey = `${documentId}:${lang}`;
  const running = inFlight.get(jobKey);
  if (running) return running;

  const job = (async () => {
    const text = await documentText(documentId, userId);
    if (!text.trim()) throw new Error("Documento sem texto");
    const source = await condensedText(text, lang);

    const [summary, concepts, flashcards, quiz] = await Promise.all([
      complete(summaryPrompt(lang, source), { lang }),
      completeJson(conceptsPrompt(lang, source), conceptsSchema, { lang }),
      completeJson(flashcardsPrompt(lang, source), flashcardsSchema, { lang }),
      completeJson(quizPrompt(lang, source), quizSchema, { lang }),
    ]);

    const row = {
      document_id: documentId,
      user_id: userId,
      summary,
      key_concepts: concepts.key_concepts,
      glossary: concepts.glossary,
      flashcards: flashcards.flashcards,
      quiz: quiz.quiz,
      lang,
      generated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("study_materials").upsert(row).select("*").single();
    if (error) throw error;

    if (force) {
      // Os cartões mudaram: o histórico de repetição antigo deixa de fazer sentido.
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
