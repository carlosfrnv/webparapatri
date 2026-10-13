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
      .slice(-120) || "ficheiro"
  );
}

/**
 * Guarda o ficheiro no Storage, cria o registo e lança a extração + divisão em fragmentos.
 * Serve tanto para os apontamentos dela como para a Biblioteca de referência (mesmo fluxo).
 */
export async function ingestDocument(params: {
  userId: string;
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  subjectId: string | null;
  sourceType: SourceKind;
  referenceOrg: ReferenceOrg | null;
  /** O script de linha de comandos espera pelo fim do processamento; a web não. */
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
    // A referência não precisa de disciplina; os apontamentos sem disciplina recebem uma sugestão da IA.
    suggestSubject: params.sourceType === "apontamentos" && !params.subjectId,
  });
  if (params.wait) await job;
  else void job;

  return data;
}
