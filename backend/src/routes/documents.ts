import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { userIdOf } from "../auth";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { compressAudio, isAudio } from "../audio";
import { MAX_AUDIO_BYTES, MAX_UPLOAD_BYTES, STORAGE_BUCKET } from "../config";
import { DOC_FIELDS, ingestDocument } from "../ingest";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { aiLimiter } from "../limits";
import { detectKind } from "../extract";
import { generateFigureQuiz, generateMindmap, getExtras, removeFigureFiles, saveExtras, saveFigures } from "../figures";
import { getOrGenerateStudy } from "../study";
import { describeFigures, figureChunk, FIGURE_PREFIX } from "../vision";
import { supabase } from "../supabase";

export const documentsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
// Clases grabadas: pueden pesar mucho, así que van a disco (no a memoria) y se comprimen antes de guardarlas.
const audioUpload = multer({ dest: tmpdir(), limits: { fileSize: MAX_AUDIO_BYTES } });

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

/** Subir una clase grabada (o cualquier audio): se comprime, se guarda y se transcribe en segundo plano. */
documentsRouter.post(
  "/audio",
  audioUpload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const file = req.file;
    if (!file) throw new HttpError(400, "noFile");
    try {
      const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
      if (!isAudio(file.mimetype, originalName)) throw new HttpError(415, "unsupportedType");
      const subjectId = z
        .string()
        .uuid()
        .nullable()
        .catch(null)
        .parse(req.body?.subject_id || null);
      if (subjectId) {
        const { data: subject } = await supabase
          .from("subjects")
          .select("id")
          .eq("id", subjectId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!subject) throw new HttpError(400, "invalidSubject");
      }
      const m4a = await compressAudio(file.path).catch((err) => {
        console.error("Error al convertir el audio:", err);
        throw new HttpError(415, "unsupportedType");
      });
      const data = await ingestDocument({
        userId,
        buffer: m4a,
        originalName: `${originalName.replace(/\.[^.]+$/, "")}.m4a`,
        mimetype: "audio/mp4",
        subjectId,
        sourceType: "apuntes",
        referenceOrg: null,
      });
      res.status(201).json(data);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }),
);

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // Por defecto solo sus apuntes; la biblioteca de referencia se pide aparte.
    const sourceType = req.query.source_type === "referencia" ? "referencia" : "apuntes";
    const subjectId = typeof req.query.subject_id === "string" ? req.query.subject_id : undefined;
    const list = (ordered: boolean) => {
      let query = supabase
        .from("documents")
        .select(DOC_FIELDS)
        .eq("user_id", userIdOf(req))
        .eq("source_type", sourceType);
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
    await removeFigureFiles(doc.id, userId).catch(() => undefined);
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

// ---------- Figuras de los archivos ya subidos ----------
// Los archivos subidos antes de que la IA leyera imágenes se pueden analizar a mano.
// El estado se guarda en memoria: si el servidor se reinicia, basta con volver a pulsar.

const figureJobs = new Map<string, { running: boolean; error?: boolean }>();

async function figureCount(documentId: string, userId: string) {
  const { count } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .like("content", `${FIGURE_PREFIX}%`);
  return count ?? 0;
}

async function analyseFigures(doc: { id: string; storage_path: string; mime_type: string | null }, userId: string) {
  const { data: file, error } = await supabase.storage.from(STORAGE_BUCKET).download(doc.storage_path);
  if (error || !file) throw error ?? new Error("Archivo no encontrado");
  const kind = detectKind(doc.mime_type ?? "", doc.storage_path);
  const figures = kind ? await describeFigures(Buffer.from(await file.arrayBuffer()), kind) : [];

  // Se sustituyen las figuras anteriores (si se analiza dos veces) y las nuevas van al final.
  await supabase
    .from("chunks")
    .delete()
    .eq("document_id", doc.id)
    .eq("user_id", userId)
    .like("content", `${FIGURE_PREFIX}%`);
  const { data: last } = await supabase
    .from("chunks")
    .select("position")
    .eq("document_id", doc.id)
    .eq("user_id", userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;
  if (figures.length > 0) {
    const { error: insertError } = await supabase.from("chunks").insert(
      figures.map((f, i) => ({
        document_id: doc.id,
        user_id: userId,
        position: start + i,
        page: f.page,
        content: figureChunk(f),
        source_type: "apuntes",
      })),
    );
    if (insertError) throw insertError;
  }
  await saveFigures(doc.id, userId, figures).catch((err) =>
    console.error(`Error al guardar las figuras de ${doc.id}:`, err),
  );
}

documentsRouter.get(
  "/:id/figures",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const doc = await ownedDocument(String(req.params.id), userId);
    const job = figureJobs.get(doc.id);
    res.json({ count: await figureCount(doc.id, userId), running: !!job?.running, failed: !!job?.error });
  }),
);

documentsRouter.post(
  "/:id/figures",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const doc = await ownedDocument(String(req.params.id), userId);
    if (doc.source_type === "referencia") throw new HttpError(409, "referenceNoStudy");
    if (doc.status !== "ready") throw new HttpError(409, "stillProcessing");
    if (!figureJobs.get(doc.id)?.running) {
      figureJobs.set(doc.id, { running: true });
      analyseFigures(doc, userId)
        .then(() => figureJobs.set(doc.id, { running: false }))
        .catch((err) => {
          console.error(`Error al leer las figuras de ${doc.id}:`, err);
          figureJobs.set(doc.id, { running: false, error: true });
        });
    }
    res.status(202).json({ running: true });
  }),
);

// ---------- Test con imágenes (figuras de sus apuntes) ----------

const figureQuizJobs = new Map<string, Promise<unknown>>();

documentsRouter.get(
  "/:id/figure-quiz",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const doc = await ownedDocument(String(req.params.id), userId);
    if (doc.source_type === "referencia") throw new HttpError(409, "referenceNoStudy");
    if (doc.status !== "ready") throw new HttpError(409, "stillProcessing");
    const extras = await getExtras(doc.id, userId);
    if (extras.missing) throw new HttpError(409, "needsUpdate");
    if (extras.figures.length === 0) {
      res.json({ needsFigures: true, questions: [] });
      return;
    }
    let questions = extras.figure_quiz[lang];
    if (!questions?.length) {
      // Si pulsa dos veces, se espera a la misma generación en vez de hacer otra.
      const key = `${doc.id}:${lang}`;
      let job = figureQuizJobs.get(key);
      if (!job) {
        job = generateFigureQuiz(doc.id, userId, lang, extras.figures)
          .then(async (qs) => {
            await saveExtras(doc.id, userId, { figure_quiz: { ...extras.figure_quiz, [lang]: qs } });
            return qs;
          })
          .finally(() => figureQuizJobs.delete(key));
        figureQuizJobs.set(key, job);
      }
      questions = (await job) as typeof questions;
    }
    const byN = new Map(extras.figures.map((f) => [f.n, f]));
    const paths = [...new Set((questions ?? []).map((q) => byN.get(q.figure)?.path).filter(Boolean))] as string[];
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    res.json({
      needsFigures: false,
      questions: (questions ?? [])
        .map((q) => {
          const f = byN.get(q.figure);
          const image_url = f ? urls.get(f.path) : undefined;
          return image_url ? { ...q, image_url, figure_page: f!.page, figure_label: f!.label } : null;
        })
        .filter(Boolean),
    });
  }),
);

// ---------- Esquema del tema ----------

// Sube al cambiar cómo se hace el esquema: los ya guardados se vuelven a hacer.
const MINDMAP_VERSION = 3;
const mindmapJobs = new Map<string, Promise<unknown>>();

documentsRouter.get(
  "/:id/mindmap",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const force = req.query.force === "1";
    const doc = await ownedDocument(String(req.params.id), userId);
    if (doc.source_type === "referencia") throw new HttpError(409, "referenceNoStudy");
    if (doc.status !== "ready") throw new HttpError(409, "stillProcessing");
    const extras = await getExtras(doc.id, userId);
    if (extras.missing) throw new HttpError(409, "needsUpdate");
    const study = (await getOrGenerateStudy(doc.id, userId, lang, false)) as {
      summary: string;
      key_concepts: { concept: string; explanation: string }[];
      glossary: { term: string; definition: string }[];
      generated_at: string;
    };
    // Se guarda junto a la fecha del material: si se genera de nuevo el resumen, el esquema se rehace.
    const cached = extras.mindmap[lang];
    const from = `${study.generated_at}#${MINDMAP_VERSION}`;
    if (cached && cached.from === from && !force) {
      res.json(cached.tree);
      return;
    }
    const key = `${doc.id}:${lang}`;
    let job = mindmapJobs.get(key);
    if (!job) {
      job = generateMindmap(
        lang,
        doc.title,
        study.summary.slice(0, 30000),
        study.key_concepts.map((c) => `- ${c.concept}: ${c.explanation}`).join("\n"),
        (study.glossary ?? []).map((g) => `- ${g.term}: ${g.definition}`).join("\n"),
      )
        .then(async (tree) => {
          const latest = await getExtras(doc.id, userId);
          const mindmap = latest.missing ? {} : latest.mindmap;
          await saveExtras(doc.id, userId, { mindmap: { ...mindmap, [lang]: { from, tree } } });
          return tree;
        })
        .finally(() => mindmapJobs.delete(key));
      mindmapJobs.set(key, job);
    }
    res.json(await job);
  }),
);

// ---------- Figuras guardadas (para mostrarlas en el resumen) ----------
// No gasta IA: son las imágenes que se guardaron al leer las figuras del archivo.

documentsRouter.get(
  "/:id/figure-images",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const doc = await ownedDocument(String(req.params.id), userId);
    const extras = await getExtras(doc.id, userId);
    if (extras.missing || extras.figures.length === 0) {
      res.json({ figures: [] });
      return;
    }
    const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(
      extras.figures.map((f) => f.path),
      3600,
    );
    const urls = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
    res.json({
      figures: extras.figures
        .filter((f) => urls.has(f.path))
        .map((f) => ({ n: f.n, page: f.page, label: f.label, description: f.description, url: urls.get(f.path) })),
    });
  }),
);
