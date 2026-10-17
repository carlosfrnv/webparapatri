import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { supabase } from "../supabase";

/** Horario semanal que ella se monta a su manera (clases, prácticas, estudio, trabajo…). */
export const scheduleRouter = Router();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const blockSchema = z
  .object({
    day: z.number().int().min(1).max(7), // 1 = lunes … 7 = domingo
    start_time: time,
    end_time: time,
    title: z.string().trim().min(1).max(80),
    subject_id: z.string().uuid().nullable().optional(),
    location: z.string().trim().max(80).nullable().optional(),
    color: z.enum(["pink", "violet", "teal", "amber", "blue", "slate"]).default("pink"),
  })
  .refine((b) => b.end_time > b.start_time, { message: "La hora de fin debe ser posterior a la de inicio" });

const FIELDS = "id, day, start_time, end_time, title, subject_id, location, color";
// Postgres devuelve las horas como "08:30:00": se dejan en "08:30".
const clean = <T extends { start_time: string; end_time: string }>(b: T) => ({
  ...b,
  start_time: b.start_time.slice(0, 5),
  end_time: b.end_time.slice(0, 5),
});

scheduleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("schedule_blocks")
      .select(FIELDS)
      .eq("user_id", userIdOf(req))
      .order("day")
      .order("start_time");
    if (error) throw error;
    res.json((data ?? []).map(clean));
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
