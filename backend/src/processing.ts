import { z } from "zod";
import { completeJson } from "./ai";
import { chunkPages } from "./chunk";
import { ExtractionError, extractText } from "./extract";
import { PROCESSING_ERRORS } from "./i18n";
import { classifyPrompt } from "./prompts";
import { supabase } from "./supabase";

/**
 * Processa um documento em segundo plano (o plano gratuito do Render não tem filas):
 * extrai o texto, divide em fragmentos e guarda-os. O frontend consulta o estado.
 */
export async function processDocument(params: {
  documentId: string;
  userId: string;
  buffer: Buffer;
  kind: string;
  title: string;
  hasSubject: boolean;
}) {
  const { documentId, userId } = params;
  try {
    const pages = await extractText(params.buffer, params.kind);
    const chunks = chunkPages(pages);

    for (let i = 0; i < chunks.length; i += 200) {
      const batch = chunks.slice(i, i + 200).map((c) => ({
        document_id: documentId,
        user_id: userId,
        position: c.position,
        page: c.page,
        content: c.content,
      }));
      const { error } = await supabase.from("chunks").insert(batch);
      if (error) throw error;
    }

    await supabase
      .from("documents")
      .update({ status: "ready", error_message: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    if (!params.hasSubject) {
      const firstText = pages.map((p) => p.text).join("\n").split(/\s+/).slice(0, 2000).join(" ");
      await suggestSubject(documentId, userId, params.title, firstText).catch((err) =>
        console.error("Falha ao sugerir disciplina:", err),
      );
    }
  } catch (err) {
    console.error(`Erro a processar o documento ${documentId}:`, err);
    // Guardamos um código; o frontend mostra a mensagem no idioma escolhido.
    const message = err instanceof ExtractionError ? err.message : PROCESSING_ERRORS.generic;
    await supabase
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId)
      .eq("user_id", userId);
  }
}

const classifySchema = z.object({
  subject_id: z.string().nullable(),
  reason: z.string().optional(),
});

async function suggestSubject(documentId: string, userId: string, title: string, text: string) {
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, year")
    .eq("user_id", userId);
  if (!subjects?.length) return;

  const list = subjects.map((s) => `${s.id}: ${s.name}, ${s.year ?? "?"}.º ano`).join("\n");
  const result = await completeJson(classifyPrompt(title, text, list), classifySchema, {
    lang: "pt",
    effort: "low",
    maxTokens: 2000,
  });
  if (result.subject_id && subjects.some((s) => s.id === result.subject_id)) {
    await supabase
      .from("documents")
      .update({ suggested_subject_id: result.subject_id })
      .eq("id", documentId)
      .eq("user_id", userId);
  }
}
