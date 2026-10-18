import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { localName } from "../seed";
import { supabase } from "../supabase";

/** Sesiones de estudio del Pomodoro: cuánto tiempo estudia y de qué asignatura. */
export const sessionsRouter = Router();

const createSchema = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  minutes: z.number().int().min(1).max(240),
});

// Si aún no se ha creado la tabla (falta ejecutar el SQL), no se guarda nada y el resumen sale vacío.
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

sessionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = createSchema.parse(req.body);
    if (body.subject_id) {
      const { data } = await supabase
        .from("subjects")
        .select("id")
        .eq("id", body.subject_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) throw new HttpError(400, "invalidSubject");
    }
    const { error } = await supabase.from("study_sessions").insert({ ...body, user_id: userId });
    if (error && !missingTable(error.code)) throw error;
    res.status(201).json({ ok: true });
  }),
);

/**
 * Resumen de los últimos 7 días: minutos por día y por asignatura.
 * `tz` es el desfase del navegador en minutos (getTimezoneOffset) para contar los días en su hora.
 */
sessionsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const tz = z.coerce.number().int().min(-900).max(900).catch(0).parse(req.query.tz);
    const localDay = (ms: number) => new Date(ms - tz * 60_000).toISOString().slice(0, 10);
    const today = localDay(Date.now());
    const days = Array.from({ length: 7 }, (_, i) => localDay(Date.now() - (6 - i) * 86_400_000));

    const { data, error } = await supabase
      .from("study_sessions")
      .select("subject_id, minutes, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 8 * 86_400_000).toISOString());
    if (error && !missingTable(error.code)) throw error;
    const rows = (data ?? []).filter((s) => days.includes(localDay(Date.parse(s.created_at))));

    const perDay = new Map<string, number>();
    const perSubject = new Map<string | null, number>();
    for (const s of rows) {
      const day = localDay(Date.parse(s.created_at));
      perDay.set(day, (perDay.get(day) ?? 0) + s.minutes);
      perSubject.set(s.subject_id, (perSubject.get(s.subject_id) ?? 0) + s.minutes);
    }

    const ids = [...perSubject.keys()].filter((id): id is string => !!id);
    const { data: subjects } = ids.length
      ? await supabase.from("subjects").select("id, name, translations").eq("user_id", userId).in("id", ids)
      : { data: [] };
    const nameOf = new Map((subjects ?? []).map((s) => [s.id, localName(s, langOf(req))]));

    res.json({
      today_minutes: perDay.get(today) ?? 0,
      week_minutes: rows.reduce((sum, s) => sum + s.minutes, 0),
      week: days.map((date) => ({ date, minutes: perDay.get(date) ?? 0 })),
      by_subject: [...perSubject]
        .map(([subject_id, minutes]) => ({
          subject_id,
          name: subject_id ? (nameOf.get(subject_id) ?? null) : null,
          minutes,
        }))
        .sort((a, b) => b.minutes - a.minutes),
    });
  }),
);
