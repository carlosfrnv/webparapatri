import { randomUUID } from "node:crypto";
import { STORAGE_BUCKET } from "./config";
import { detectKind } from "./extract";
import { HttpError } from "./http";
import { processDocument } from "./processing";
import type { SourceKind } from "./search";
import { supabase } from "./supabase";

export const DOC_FIELDS =
  "id, title, subject_id, suggested_subject_id, mime_type, status, error_message, created_at, source_type, reference_org";

export type ReferenceOrg = "IAEA" | "EFRS";

function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(-120) || "archivo"
  );
}

/**
 * Guarda el archivo en Storage, crea el registro y lanza la extracción + troceado en fragmentos.
 * Sirve tanto para sus apuntes como para la biblioteca de referencia (mismo flujo).
 */
export async function ingestDocument(params: {
  userId: string;
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  subjectId: string | null;
  sourceType: SourceKind;
  referenceOrg: ReferenceOrg | null;
  /** El script de terminal espera a que termine el procesado; la web no. */
  wait?: boolean;
}) {
  const kind = detectKind(params.mimetype, params.originalName);
  if (!kind) throw new HttpError(415, "unsupportedType");

  const id = randomUUID();
  const folder = params.sourceType === "referencia" ? "referencia" : "";
  const storagePath = [params.userId, folder, id, safeFileName(params.originalName)].filter(Boolean).join("/");
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, params.buffer, { contentType: params.mimetype || undefined, upsert: false });
  if (uploadError) {
    console.error(uploadError);
    throw new HttpError(500, "saveFailed");
  }

  const title = params.originalName.replace(/\.[^.]+$/, "");
  const { data, error } = await supabase
    .from("documents")
    .insert({
      id,
      user_id: params.userId,
      subject_id: params.sourceType === "referencia" ? null : params.subjectId,
      title,
      storage_path: storagePath,
      mime_type: params.mimetype,
      status: "processing",
      source_type: params.sourceType,
      reference_org: params.sourceType === "referencia" ? params.referenceOrg : null,
    })
    .select(DOC_FIELDS)
    .single();
  if (error) throw error;

  const job = processDocument({
    documentId: id,
    userId: params.userId,
    buffer: params.buffer,
    kind,
    title,
    sourceType: params.sourceType,
    // La referencia no necesita asignatura; los apuntes sin asignatura reciben una sugerencia de la IA.
    suggestSubject: params.sourceType === "apuntes" && !params.subjectId,
  });
  if (params.wait) await job;
  else void job;

  return data;
}
