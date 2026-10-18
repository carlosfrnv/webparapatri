import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { localName, seedSubjectsIfEmpty } from "../seed";
import { supabase } from "../supabase";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";

export const subjectsRouter = Router();

const areaSchema = z.enum(["base", "radiologia", "medicina_nuclear", "radioterapia", "transversal"]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  year: z.number().int().min(1).max(4).nullable().optional(),
  area: areaSchema.nullable().optional(),
});
const updateSchema = createSchema.partial();

subjectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await seedSubjectsIfEmpty(userId, langOf(req));
    const { data, error } = await supabase
      .from("subjects")
      // documents tiene dos claves hacia subjects (subject_id y suggested_subject_id): hay que decir cuál.
      .select("id, name, translations, year, area, created_at, documents!documents_subject_id_fkey(count)")
      .eq("user_id", userId)
      .order("year", { ascending: true, nullsFirst: false })
      .order("name");
    if (error) throw error;
    res.json(
      (data ?? []).map(({ documents, translations, ...s }) => ({
        ...s,
        name: localName({ name: s.name, translations }, langOf(req)),
        document_count: (documents as unknown as { count: number }[])[0]?.count ?? 0,
      })),
    );
  }),
);

subjectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabase
      .from("subjects")
      .insert({ ...body, user_id: userIdOf(req) })
      .select("*")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

subjectsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabase
      .from("subjects")
      // Si le cambia el nombre, deja de usarse la traducción automática.
      .update(body.name ? { ...body, translations: null } : body)
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req))
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "subjectNotFound");
    const { translations, ...subject } = data;
    res.json({ ...subject, name: localName({ name: subject.name, translations }, langOf(req)) });
  }),
);

subjectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Los documentos se quedan sin asignatura (on delete set null), no se borran.
    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req));
    if (error) throw error;
    res.status(204).end();
  }),
);

// ---------- Notas y créditos ----------
// Van aparte de GET / para que la Biblioteca siga funcionando aunque aún no se hayan creado las columnas.

subjectsRouter.get(
  "/grades/all",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, translations, year, area, ects, grade")
      .eq("user_id", userId)
      .order("year", { ascending: true, nullsFirst: false })
      .order("name");
    if (error?.code === "42703") throw new HttpError(409, "needsUpdate");
    if (error) throw error;
    res.json(
      (data ?? []).map(({ translations, ...s }) => ({
        ...s,
        name: localName({ name: s.name, translations }, langOf(req)),
        ects: s.ects === null ? null : Number(s.ects),
        grade: s.grade === null ? null : Number(s.grade),
      })),
    );
  }),
);

const gradeSchema = z.object({
  ects: z.number().min(0).max(60).nullable().optional(),
  // Escala portuguesa de 0 a 20; vacío = todavía sin nota.
  grade: z.number().min(0).max(20).nullable().optional(),
});

subjectsRouter.patch(
  "/:id/grade",
  asyncHandler(async (req, res) => {
    const body = gradeSchema.parse(req.body);
    const { data, error } = await supabase
      .from("subjects")
      .update(body)
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req))
      .select("id, ects, grade")
      .maybeSingle();
    if (error?.code === "42703") throw new HttpError(409, "needsUpdate");
    if (error) throw error;
    if (!data) throw new HttpError(404, "subjectNotFound");
    res.json({
      ...data,
      ects: data.ects === null ? null : Number(data.ects),
      grade: data.grade === null ? null : Number(data.grade),
    });
  }),
);
