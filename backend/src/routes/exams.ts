import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { localName, seedSubjectsIfEmpty } from "../seed";
import { supabase } from "../supabase";

export const examsRouter = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createSchema = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  exam_date: dateSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});
const updateSchema = createSchema.partial();

// Un tema se da por dominado cuando el último test sale con un 80 % o más.
const MASTERED_PCT = 80;
// Solo se planifica el estudio de los exámenes de las próximas semanas.
const PLAN_DAYS = 45;

interface ExamRow {
  id: string;
  subject_id: string | null;
  title: string;
  exam_date: string;
  notes: string | null;
  subjects: { name: string; translations: unknown } | null;
}

export type PlanTask =
  | { type: "flashcards"; count: number; subject_id: string }
  | {
      type: "prepare" | "test";
      document_id: string;
      title: string;
      last_pct: number | null;
    };

/** Días entre dos fechas "AAAA-MM-DD" (sin horas, así no influye la zona horaria). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Lo que toca estudiar hoy para un examen. Sin IA: se reparten los temas que aún no domina
 * entre los días que quedan (el día antes del examen queda libre para un repaso general),
 * empezando por los más flojos. Como los temas dominados salen de la lista, el plan se ajusta solo.
 */
async function planFor(userId: string, subjectId: string, daysLeft: number) {
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("source_type", "apuntes")
    .eq("status", "ready")
    .order("created_at");
  const ids = (docs ?? []).map((d) => d.id);
  if (ids.length === 0) return { tasks: [] as PlanTask[], total_docs: 0, mastered_docs: 0 };

  const [materials, reviews, attempts] = await Promise.all([
    supabase.from("study_materials").select("document_id, flashcards").eq("user_id", userId).in("document_id", ids),
    supabase
      .from("flashcard_reviews")
      .select("document_id, card_index, due_at")
      .eq("user_id", userId)
      .in("document_id", ids),
    supabase
      .from("quiz_attempts")
      .select("document_id, score, total, created_at")
      .eq("user_id", userId)
      .in("document_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  // Flashcards por repasar de esta asignatura (nuevas o con la fecha de repaso cumplida).
  const reviewMap = new Map((reviews.data ?? []).map((r) => [`${r.document_id}:${r.card_index}`, r.due_at as string]));
  const now = Date.now();
  let dueCards = 0;
  const withMaterial = new Set<string>();
  for (const m of materials.data ?? []) {
    withMaterial.add(m.document_id);
    ((m.flashcards ?? []) as unknown[]).forEach((_, i) => {
      const dueAt = reviewMap.get(`${m.document_id}:${i}`);
      if (!dueAt || Date.parse(dueAt) <= now) dueCards++;
    });
  }

  // Nota del último test de cada tema.
  const lastPct = new Map<string, number>();
  for (const a of attempts.data ?? []) {
    if (!lastPct.has(a.document_id)) lastPct.set(a.document_id, Math.round((a.score / a.total) * 100));
  }

  const pending = (docs ?? [])
    .filter((d) => (lastPct.get(d.id) ?? -1) < MASTERED_PCT)
    // Primero los que nunca ha hecho, luego los de peor nota.
    .sort((a, b) => (lastPct.get(a.id) ?? -1) - (lastPct.get(b.id) ?? -1));

  const studyDays = daysLeft >= 2 ? daysLeft - 1 : 1;
  const perDay = daysLeft === 1 ? Math.min(pending.length, 3) : Math.ceil(pending.length / studyDays);

  const tasks: PlanTask[] = [];
  if (dueCards > 0) tasks.push({ type: "flashcards", count: dueCards, subject_id: subjectId });
  for (const d of pending.slice(0, perDay)) {
    tasks.push({
      type: withMaterial.has(d.id) ? "test" : "prepare",
      document_id: d.id,
      title: d.title,
      last_pct: lastPct.get(d.id) ?? null,
    });
  }
  return {
    tasks,
    total_docs: ids.length,
    mastered_docs: ids.length - pending.length,
  };
}

/**
 * Exámenes y plan de hoy. El frontend manda su fecha (`today`) para que los días que faltan
 * cuadren con su zona horaria.
 */
examsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await seedSubjectsIfEmpty(userId, langOf(req));
    const today = dateSchema.safeParse(req.query.today).success
      ? String(req.query.today)
      : new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("exams")
      .select("id, subject_id, title, exam_date, notes, subjects(name, translations)")
      .eq("user_id", userId)
      .order("exam_date");
    if (error) throw error;

    const exams = ((data ?? []) as unknown as ExamRow[]).map(({ subjects, ...e }) => ({
      ...e,
      subject_name: subjects ? localName(subjects, langOf(req)) : null,
      days_left: daysBetween(today, e.exam_date),
    }));

    const plan = await Promise.all(
      exams
        .filter((e) => e.days_left >= 0 && e.days_left <= PLAN_DAYS)
        .map(async (e) => ({
          exam_id: e.id,
          ...(e.subject_id && e.days_left > 0
            ? await planFor(userId, e.subject_id, e.days_left)
            : { tasks: [] as PlanTask[], total_docs: 0, mastered_docs: 0 }),
        })),
    );

    res.json({ today, exams, plan });
  }),
);

async function checkSubject(userId: string, subjectId: string | null | undefined) {
  if (!subjectId) return;
  const { data } = await supabase.from("subjects").select("id").eq("id", subjectId).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(400, "invalidSubject");
}

examsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = createSchema.parse(req.body);
    await checkSubject(userId, body.subject_id);
    const { data, error } = await supabase
      .from("exams")
      .insert({ ...body, user_id: userId })
      .select("*")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

examsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = updateSchema.parse(req.body);
    await checkSubject(userId, body.subject_id);
    const { data, error } = await supabase
      .from("exams")
      .update(body)
      .eq("id", String(req.params.id))
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "examNotFound");
    res.json(data);
  }),
);

examsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req));
    if (error) throw error;
    res.status(204).end();
  }),
);
