import { z } from "zod";
import { completeJson } from "./ai";
import { chunkPages } from "./chunk";
import { ExtractionError, extractText } from "./extract";
import { PROCESSING_ERRORS } from "./i18n";
import { classifyPrompt } from "./prompts";
import { STORAGE_BUCKET } from "./config";
import { detectKind } from "./extract";
import { supabase } from "./supabase";
import { describeFigures, figureChunk, transcribePdf } from "./vision";
import { transcribeAudio } from "./audio";
import { saveFigures } from "./figures";
import { isFormulaDocument } from "./formulas";
import { getOrGenerateStudy } from "./study";
import type { Lang } from "./i18n";

/**
 * Procesa un documento en segundo plano (el plan gratuito de Render no tiene colas):
 * extrae el texto, lo divide en fragmentos y los guarda. El frontend consulta el estado.
 */
/**
 * Texto que admite la base de datos: el carácter nulo (algunos PDF de Google Slides lo ponen donde había una flecha)
 * hace que Postgres rechace todo el documento ("unsupported Unicode escape sequence"). Se cambia por una flecha y
 * se quitan los demás caracteres de control invisibles y las mitades sueltas de emoji.
 */
export function dbSafe(text: string) {
  return text
    .replace(/\u0000/g, "→")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

// De uno en uno: si sube varios apuntes a la vez, procesarlos juntos multiplica la memoria y el servidor gratuito
// (512 MB) se reiniciaba a mitad.
let lane: Promise<unknown> = Promise.resolve();
export function processDocument(params: Parameters<typeof processOne>[0]) {
  const job = lane.then(() => processOne(params));
  lane = job.catch(() => undefined);
  return job;
}

async function processOne(params: {
  documentId: string;
  userId: string;
  buffer: Buffer;
  kind: string;
  title: string;
  sourceType: "apuntes" | "referencia";
  suggestSubject: boolean;
  /** Al reintentar un documento que se quedó a medias: sin leer las figuras (lo más pesado). */
  skipFigures?: boolean;
  /** Idioma en que se prepara el resumen al terminar (el de la web al subirlo). */
  lang?: Lang;
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
      // Como mucho 8 minutos: si la IA no da abasto, se avisa en vez de quedarse "procesando" para siempre.
      pages = await Promise.race([
        transcribePdf(params.buffer),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("tiempo agotado")), 8 * 60_000)),
      ]).catch((e) => {
        console.error("Error al leer el PDF escaneado:", e);
        return [];
      });
      if (pages.length === 0) throw err;
      scanned = true;
    }
    const chunks = chunkPages(pages);

    for (let i = 0; i < chunks.length; i += 200) {
      const batch = chunks.slice(i, i + 200).map((c) => ({
        document_id: documentId,
        user_id: userId,
        position: c.position,
        page: c.page,
        content: dbSafe(c.content),
        source_type: params.sourceType,
      }));
      const { error } = await supabase.from("chunks").insert(batch);
      if (error) throw error;
    }

    // Ya se puede estudiar con el texto: "Listo" sin esperar a las figuras, que tardan minutos con una clase entera.
    await supabase
      .from("documents")
      .update({ status: "ready", error_message: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    // Figuras (esquemas, radiografías…): la IA las describe y se añaden como fragmentos más.
    // Si falla, el documento se queda solo con el texto (ya está "Listo").
    if (isNotes && !scanned && !params.skipFigures) {
      try {
        const formulas = await isFormulaDocument(documentId, userId).catch(() => false);
        // Como mucho 4 minutos: si la IA tarda más (saturada), se queda solo con el texto.
        const figures = await Promise.race([
          describeFigures(params.buffer, params.kind, { formulas }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("tiempo agotado")), 4 * 60_000)),
        ]).catch((err) => {
          console.error(`Error al leer las figuras de ${documentId}:`, err);
          return [];
        });
        if (figures.length > 0) {
          const { error } = await supabase.from("chunks").insert(
            figures.map((f, k) => ({
              document_id: documentId,
              user_id: userId,
              position: chunks.length + k,
              page: f.page,
              content: dbSafe(figureChunk(f)),
              source_type: params.sourceType,
            })),
          );
          if (error) console.error(`Error al guardar las figuras de ${documentId}:`, error);
          // Las imágenes se guardan para las preguntas con imágenes.
          await saveFigures(documentId, userId, figures).catch((err) =>
            console.error(`Error al guardar las imágenes de ${documentId}:`, err),
          );
        }
      } catch (err) {
        console.error(`Error con las figuras de ${documentId}:`, err);
      }
    }

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

    // El resumen, las flashcards y el test se preparan ya, en segundo plano: así, cuando abra el documento,
    // están hechos (antes se generaban al abrirlo y tardaban uno o dos minutos con una clase entera).
    if (isNotes)
      void getOrGenerateStudy(documentId, userId, params.lang ?? "es").catch((err) =>
        console.error(`Error al preparar el resumen de ${documentId}:`, err),
      );
  } catch (err) {
    console.error(`Error al procesar el documento ${documentId}:`, err);
    // Guardamos un código; el frontend muestra el mensaje en el idioma elegido.
    // En los errores inesperados se guarda también el motivo técnico (corto), para poder ver qué ha fallado.
    const detail = String((err as { message?: string })?.message ?? err)
      .replace(/\s+/g, " ")
      .slice(0, 160);
    const message = err instanceof ExtractionError ? err.message : `${PROCESSING_ERRORS.generic} — ${detail}`;
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

// Marca (en error_message) de un documento que se está reintentando tras quedarse a medias.
// (Se cambió de nombre al arreglar la memoria: los que fallaron con la versión anterior tienen otra oportunidad.)
const RETRYING = "retrying-v2";

/**
 * Documentos que se quedaron en "procesando" porque el servidor se reinició o se durmió a mitad (el plan gratuito de
 * Render lo hace): se vuelven a procesar una vez desde el archivo guardado (sin figuras, que es lo más pesado); si
 * vuelve a fallar, se marcan con error para que ella pueda volver a subirlos en vez de esperar para siempre.
 */
export async function recoverStuckDocuments() {
  const before = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("documents")
    .select("id, user_id, title, storage_path, mime_type, source_type, error_message")
    .eq("status", "processing")
    .lt("created_at", before)
    .limit(20);
  if (error || !data?.length) return;
  for (const doc of data) {
    if (doc.error_message === RETRYING) {
      await supabase
        .from("documents")
        .update({ status: "error", error_message: PROCESSING_ERRORS.generic })
        .eq("id", doc.id);
      continue;
    }
    const kind = detectKind(doc.mime_type ?? "", doc.storage_path);
    const file = kind ? await supabase.storage.from(STORAGE_BUCKET).download(doc.storage_path) : null;
    if (!kind || !file?.data) {
      await supabase
        .from("documents")
        .update({ status: "error", error_message: PROCESSING_ERRORS.generic })
        .eq("id", doc.id);
      continue;
    }
    console.warn(`[documentos] "${doc.title}" se quedó a medias: se vuelve a procesar.`);
    await supabase.from("documents").update({ error_message: RETRYING }).eq("id", doc.id);
    // Si quedaron fragmentos de la vez anterior, se quitan para no duplicarlos.
    await supabase.from("chunks").delete().eq("document_id", doc.id);
    await processDocument({
      documentId: doc.id,
      userId: doc.user_id,
      buffer: Buffer.from(await file.data.arrayBuffer()),
      kind,
      title: doc.title,
      sourceType: doc.source_type === "referencia" ? "referencia" : "apuntes",
      suggestSubject: false,
      skipFigures: true,
    });
  }
}
