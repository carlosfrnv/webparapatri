import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { userIdOf } from "../auth";
import { MAX_UPLOAD_BYTES, STORAGE_BUCKET } from "../config";
import { DOC_FIELDS, ingestDocument } from "../ingest";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { aiLimiter } from "../limits";
import { getOrGenerateStudy } from "../study";
import { supabase } from "../supabase";

export const documentsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

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

const uploadFieldsSchema = z.object({
  subject_id: z.string().uuid().nullable().catch(null),
  source_type: z.enum(["apuntes", "referencia"]).catch("apuntes"),
  reference_org: z.enum(["IAEA", "EFRS"]).nullable().catch(null),
});

documentsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const file = req.file;
    if (!file) throw new HttpError(400, "noFile");

    // multer lee el nombre en latin1; lo convertimos para mantener las tildes.
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const fields = uploadFieldsSchema.parse({
      subject_id: req.body?.subject_id || null,
      source_type: req.body?.source_type,
      reference_org: req.body?.reference_org || null,
    });
    if (fields.source_type === "referencia" && !fields.reference_org) throw new HttpError(400, "invalidData");

    if (fields.subject_id) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id")
        .eq("id", fields.subject_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!subject) throw new HttpError(400, "invalidSubject");
    }

    const data = await ingestDocument({
      userId,
      buffer: file.buffer,
      originalName,
      mimetype: file.mimetype,
      subjectId: fields.subject_id,
      sourceType: fields.source_type,
      referenceOrg: fields.reference_org,
    });
    res.status(201).json(data);
  }),
);

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // Por defecto solo sus apuntes; la biblioteca de referencia se pide aparte.
    const sourceType = req.query.source_type === "referencia" ? "referencia" : "apuntes";
    const subjectId = typeof req.query.subject_id === "string" ? req.query.subject_id : undefined;
    const list = (ordered: boolean) => {
      let query = supabase.from("documents").select(DOC_FIELDS).eq("user_id", userIdOf(req)).eq("source_type", sourceType);
      if (subjectId === "none") query = query.is("subject_id", null);
      else if (subjectId) query = query.eq("subject_id", subjectId);
      // Primero el orden que ella haya elegido; los que no tienen orden, al final y de más nuevo a más antiguo.
      if (ordered) query = query.order("position", { ascending: true, nullsFirst: false });
      return query.order("created_at", { ascending: false });
    };
    let { data, error } = await list(true);
    // Si todavía no existe la columna "position" (falta ejecutar el SQL), se ordena solo por fecha.
    if (error?.code === "42703") ({ data, error } = await list(false));
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

const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** Guarda el orden de una lista de archivos (el de la asignatura o los "sin asignatura"). */
documentsRouter.post(
  "/reorder",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ids } = reorderSchema.parse(req.body);
    const results = await Promise.all(
      ids.map((id, position) => supabase.from("documents").update({ position }).eq("id", id).eq("user_id", userId)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    res.json({ ok: true });
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
    // Los fragmentos, materiales y repasos se borran en cascada.
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
  // La biblioteca de referencia solo sirve para buscar: no genera resúmenes ni flashcards.
  if (doc.source_type === "referencia") throw new HttpError(409, "referenceNoStudy");
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
