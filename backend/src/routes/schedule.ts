import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { supabase } from "../supabase";

/**
 * Horario que ella se monta a su manera (clases, prácticas, estudio, trabajo…).
 * Como el horario de la escuela cambia cada semana, cada bloque puede ser de un día concreto (`date`)
 * o repetirse todas las semanas (`date` vacío, se usa `day`).
 */
export const scheduleRouter = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const blockSchema = z
  .object({
    day: z.number().int().min(1).max(7), // 1 = lunes … 7 = domingo
    date: dateSchema.nullable().optional(), // Solo ese día; vacío = todas las semanas
    start_time: time,
    end_time: time,
    title: z.string().trim().min(1).max(80),
    subject_id: z.string().uuid().nullable().optional(),
    location: z.string().trim().max(80).nullable().optional(),
    class_type: z.string().trim().max(20).nullable().optional(), // T, TP, OT, PL…
    teacher: z.string().trim().max(80).nullable().optional(),
    color: z.enum(["pink", "violet", "teal", "amber", "blue", "slate"]).default("pink"),
  })
  .refine((b) => b.end_time > b.start_time, { message: "La hora de fin debe ser posterior a la de inicio" })
  // Si es de un día concreto, el día de la semana sale de la fecha.
  .transform((b) => (b.date ? { ...b, day: weekdayOf(b.date) } : b));

/** 1 = lunes … 7 = domingo para una fecha AAAA-MM-DD. */
function weekdayOf(iso: string): number {
  return ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const FIELDS = "id, day, date, start_time, end_time, title, subject_id, location, class_type, teacher, color";
// Por si todavía no se ha ejecutado el SQL con las columnas nuevas.
const OLD_FIELDS = "id, day, start_time, end_time, title, subject_id, location, color";
// Postgres devuelve las horas como "08:30:00": se dejan en "08:30".
const clean = <T extends { start_time: string; end_time: string }>(b: T) => ({
  date: null,
  class_type: null,
  teacher: null,
  ...b,
  start_time: b.start_time.slice(0, 5),
  end_time: b.end_time.slice(0, 5),
});

/**
 * Bloques del horario. Con `from` y `to` (AAAA-MM-DD) solo devuelve los de esas fechas
 * más los que se repiten todas las semanas.
 */
scheduleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const from = dateSchema.safeParse(req.query.from).success ? String(req.query.from) : null;
    const to = dateSchema.safeParse(req.query.to).success ? String(req.query.to) : null;
    const list = (fields: string, withDates: boolean) => {
      let q = supabase.from("schedule_blocks").select(fields).eq("user_id", userIdOf(req));
      if (withDates && from && to) q = q.or(`date.is.null,and(date.gte.${from},date.lte.${to})`);
      return q.order("day").order("start_time");
    };
    let { data, error } = await list(FIELDS, true);
    if (error?.code === "42703") ({ data, error } = await list(OLD_FIELDS, false));
    if (error) throw error;
    res.json(((data ?? []) as unknown as { start_time: string; end_time: string }[]).map(clean));
  }),
);

/** Copia los bloques de un día concreto de una semana a la semana siguiente (o a la que se diga). */
scheduleRouter.post(
  "/copy-week",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { from, to } = z.object({ from: dateSchema, to: dateSchema }).parse(req.body);
    if (weekdayOf(from) !== 1 || weekdayOf(to) !== 1 || from === to) throw new HttpError(400, "invalidData");
    const { data, error } = await supabase
      .from("schedule_blocks")
      .select("day, date, start_time, end_time, title, subject_id, location, class_type, teacher, color")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", addDays(from, 6));
    if (error) throw error;
    const shift = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    const rows = (data ?? []).map((b) => ({ ...b, date: addDays(b.date as string, shift), user_id: userId }));
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("schedule_blocks").insert(rows);
      if (insertError) throw insertError;
    }
    res.json({ copied: rows.length });
  }),
);

scheduleRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = blockSchema.parse(req.body);
    const { data, error } = await supabase
      .from("schedule_blocks")
      .insert({ ...body, user_id: userIdOf(req) })
      .select(FIELDS)
      .single();
    if (error) throw error;
    res.status(201).json(clean(data));
  }),
);

scheduleRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = blockSchema.parse(req.body);
    const { data, error } = await supabase
      .from("schedule_blocks")
      .update(body)
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req))
      .select(FIELDS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "invalidData");
    res.json(clean(data));
  }),
);

scheduleRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("schedule_blocks")
      .delete()
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req));
    if (error) throw error;
    res.status(204).end();
  }),
);
