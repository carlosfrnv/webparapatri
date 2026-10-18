import { z } from "zod";
import { completeJson } from "./ai";
import { chunkPages } from "./chunk";
import { ExtractionError, extractText } from "./extract";
import { PROCESSING_ERRORS } from "./i18n";
import { classifyPrompt } from "./prompts";
import { supabase } from "./supabase";
import { describeFigures, figureChunk, transcribePdf } from "./vision";
import { transcribeAudio } from "./audio";
import { saveFigures } from "./figures";

/**
 * Procesa un documento en segundo plano (el plan gratuito de Render no tiene colas):
 * extrae el texto, lo divide en fragmentos y los guarda. El frontend consulta el estado.
 */
export async function processDocument(params: {
  documentId: string;
  userId: string;
  buffer: Buffer;
  kind: string;
  title: string;
  sourceType: "apuntes" | "referencia";
  suggestSubject: boolean;
}) {
  const { documentId, userId } = params;
  try {
    const isNotes = params.sourceType === "apuntes";
    let pages;
    let scanned = false;
    try {
      pages =
        params.kind === "audio" ? await transcribeAudio(params.buffer) : await extractText(params.buffer, params.kind);
    } catch (err) {
      // PDF escaneado (solo imágenes): en sus apuntes, la IA lee las páginas.
      if (
        !(
          isNotes &&
          params.kind === "pdf" &&
          err instanceof ExtractionError &&
          err.message === PROCESSING_ERRORS.scanned
        )
      )
        throw err;
      pages = await transcribePdf(params.buffer).catch((e) => {
        console.error("Error al leer el PDF escaneado:", e);
        return [];
      });
      if (pages.length === 0) throw err;
      scanned = true;
    }
    const chunks = chunkPages(pages);

    // Figuras (esquemas, radiografías…): la IA las describe y se guardan como fragmentos más.
    // Si falla, el documento se queda solo con el texto.
    if (isNotes && !scanned) {
      const figures = await describeFigures(params.buffer, params.kind).catch((err) => {
        console.error(`Error al leer las figuras de ${documentId}:`, err);
        return [];
      });
      for (const f of figures) chunks.push({ position: chunks.length, page: f.page, content: figureChunk(f) });
      // Las imágenes se guardan para las preguntas con imágenes.
      if (figures.length > 0)
        await saveFigures(documentId, userId, figures).catch((err) =>
          console.error(`Error al guardar las figuras de ${documentId}:`, err),
        );
    }

    for (let i = 0; i < chunks.length; i += 200) {
      const batch = chunks.slice(i, i + 200).map((c) => ({
        document_id: documentId,
        user_id: userId,
        position: c.position,
        page: c.page,
        content: c.content,
        source_type: params.sourceType,
      }));
      const { error } = await supabase.from("chunks").insert(batch);
      if (error) throw error;
    }

    await supabase
      .from("documents")
      .update({ status: "ready", error_message: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    if (params.suggestSubject) {
      const firstText = pages
        .map((p) => p.text)
        .join("\n")
        .split(/\s+/)
        .slice(0, 2000)
        .join(" ");
      await suggestSubject(documentId, userId, params.title, firstText).catch((err) =>
        console.error("Error al sugerir asignatura:", err),
      );
    }
  } catch (err) {
    console.error(`Error al procesar el documento ${documentId}:`, err);
    // Guardamos un código; el frontend muestra el mensaje en el idioma elegido.
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
  const { data: subjects } = await supabase.from("subjects").select("id, name, year").eq("user_id", userId);
  if (!subjects?.length) return;

  const list = subjects.map((s) => `${s.id}: ${s.name}, ${s.year ?? "?"}.º curso`).join("\n");
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
