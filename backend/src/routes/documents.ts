import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { userIdOf } from "../auth";
import { MAX_UPLOAD_BYTES, STORAGE_BUCKET } from "../config";
import { detectKind } from "../extract";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { aiLimiter } from "../limits";
import { processDocument } from "../processing";
import { getOrGenerateStudy } from "../study";
import { supabase } from "../supabase";

export const documentsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const DOC_FIELDS = "id, title, subject_id, suggested_subject_id, mime_type, status, error_message, created_at";

function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(-120) || "ficheiro"
  );
}

async function ownedDocument(id: string, userId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select(`${DOC_FIELDS}, storage_path`)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "documentNotFound");
  return data;
}

documentsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const file = req.file;
    if (!file) throw new HttpError(400, "noFile");

    // O multer lê o nome em latin1; convertemos para manter acentos.
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const kind = detectKind(file.mimetype, originalName);
    if (!kind) {
      throw new HttpError(415, "unsupportedType");
    }

    const subjectId = z.string().uuid().nullable().catch(null).parse(req.body?.subject_id || null);
    if (subjectId) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("id", subjectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!subject) throw new HttpError(400, "invalidSubject");
    }

    const id = randomUUID();
    const storagePath = `${userId}/${id}/${safeFileName(originalName)}`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) {
      console.error(uploadError);
      throw new HttpError(500, "saveFailed");
    }

    const title = originalName.replace(/\.[^.]+$/, "");
    const { data, error } = await supabase
      .from("documents")
      .insert({
        id,
        user_id: userId,
        subject_id: subjectId,
        title,
        storage_path: storagePath,
        mime_type: file.mimetype,
        status: "processing",
      })
      .select(DOC_FIELDS)
      .single();
    if (error) throw error;

    // Processa em segundo plano; o frontend vai consultando o estado.
    void processDocument({ documentId: id, userId, buffer: file.buffer, kind, title, hasSubject: !!subjectId });

    res.status(201).json(data);
  }),
);

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabase
      .from("documents")
      .select(DOC_FIELDS)
      .eq("user_id", userIdOf(req))
      .order("created_at", { ascending: false });
    const subjectId = typeof req.query.subject_id === "string" ? req.query.subject_id : undefined;
    if (subjectId === "none") query = query.is("subject_id", null);
    else if (subjectId) query = query.eq("subject_id", subjectId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data ?? []);
  }),
);

documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { storage_path: _path, ...doc } = await ownedDocument(String(req.params.id), userIdOf(req));
    res.json(doc);
  }),
);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  subject_id: z.string().uuid().nullable().optional(),
});

documentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = patchSchema.parse(req.body);
    await ownedDocument(String(req.params.id), userId);
    if (body.subject_id) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("id", body.subject_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!subject) throw new HttpError(400, "invalidSubject");
    }
    const update: Record<string, unknown> = { ...body };
    if ("subject_id" in body) update.suggested_subject_id = null;
    const { data, error } = await supabase
      .from("documents")
      .update(update)
      .eq("id", String(req.params.id))
      .eq("user_id", userId)
      .select(DOC_FIELDS)
      .single();
    if (error) throw error;
    res.json(data);
  }),
);

documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const doc = await ownedDocument(String(req.params.id), userId);
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
    // Fragmentos, materiais e revisões apagam-se em cascata.
    const { error } = await supabase.from("documents").delete().eq("id", doc.id).eq("user_id", userId);
    if (error) throw error;
    res.status(204).end();
  }),
);

documentsRouter.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const doc = await ownedDocument(String(req.params.id), userIdOf(req));
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.storage_path, 60 * 10);
    if (error || !data) throw new HttpError(500, "openFailed");
    res.json({ url: data.signedUrl, mime_type: doc.mime_type });
  }),
);

async function studyHandler(req: Parameters<Parameters<typeof asyncHandler>[0]>[0], force: boolean) {
  const userId = userIdOf(req);
  const doc = await ownedDocument(String(req.params.id), userId);
  if (doc.status === "processing") throw new HttpError(409, "stillProcessing");
  if (doc.status === "error") throw new HttpError(409, "documentHasError");
  return getOrGenerateStudy(doc.id, userId, langOf(req), force);
}

documentsRouter.get(
  "/:id/study",
  aiLimiter,
  asyncHandler(async (req, res) => {
    res.json(await studyHandler(req, false));
  }),
);

documentsRouter.post(
  "/:id/study/regenerate",
  aiLimiter,
  asyncHandler(async (req, res) => {
    res.json(await studyHandler(req, true));
  }),
);
