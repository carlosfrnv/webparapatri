import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AiError, completeJson, generate } from "../ai";
import {
  type AssignmentMeta,
  draftPrompt,
  outlinePrompt,
  researchPrompt,
  reviewPrompt,
} from "../assignments";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf, type Lang, type MessageKey, t } from "../i18n";
import { aiLimiter } from "../limits";
import { findSources, formatSources } from "../search";
import { supabase } from "../supabase";
import { WEB_ENABLED } from "../web";

/**
 * Asistente de trabajos: datos del trabajo, índice, investigación con fuentes por apartado, borradores con citas
 * y revisión de lo que ella escribe. Todo se guarda para seguir otro día.
 */
export const assignmentsRouter = Router();

const missingTable = (code?: string) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(code ?? "");
function check(error: { code?: string } | null) {
  if (missingTable(error?.code)) throw new HttpError(409, "needsUpdate");
  if (error) throw error;
}

const metaSchema = z.object({
  kind: z.string().trim().max(80).default("Trabajo escrito"),
  words: z.number().int().min(100).max(30000).default(2000),
  lang: z.enum(["es", "pt"]).default("pt"),
  citation: z.enum(["APA", "Vancouver"]).default("APA"),
  subject: z.string().trim().max(160).optional(),
  instructions: z.string().max(8000).optional(),
});

const sourceSchema = z.object({
  kind: z.literal("web"),
  site: z.string().max(80),
  title: z.string().max(300),
  url: z.string().max(2000),
});
const sectionSchema = z.object({
  id: z.string().max(40),
  title: z.string().trim().max(200),
  goal: z.string().max(1000).default(""),
  words: z.number().int().min(0).max(20000).default(0),
  research: z.string().max(40000).default(""),
  sources: z.array(sourceSchema).max(30).default([]),
  draft: z.string().max(60000).default(""),
  // Lo que la IA está haciendo ahora con este apartado y, si falló, por qué (código del mensaje).
  status: z.enum(["research", "draft"]).nullable().optional(),
  error: z.string().max(60).nullable().optional(),
});
type Section = z.infer<typeof sectionSchema>;

const FIELDS = "id, title, subject_id, meta, sections, created_at, updated_at";

async function own(userId: string, id: string) {
  const { data, error } = await supabase
    .from("assignments")
    .select(FIELDS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  check(error);
  if (!data) throw new HttpError(404, "assignmentNotFound");
  return data as {
    id: string;
    title: string;
    subject_id: string | null;
    meta: AssignmentMeta;
    sections: Section[];
  };
}

async function saveSections(userId: string, id: string, sections: Section[]) {
  const { error } = await supabase
    .from("assignments")
    .update({ sections, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  check(error);
}

assignmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("assignments")
      .select("id, title, meta, sections, updated_at")
      .eq("user_id", userIdOf(req))
      .order("updated_at", { ascending: false });
    if (missingTable(error?.code)) {
      res.json({ ready: false, items: [] });
      return;
    }
    check(error);
    const items = (data ?? []).map((a) => {
      const s = (a.sections ?? []) as Section[];
      return {
        id: a.id,
        title: a.title,
        meta: a.meta,
        updated_at: a.updated_at,
        sections: s.length,
        drafted: s.filter((x) => x.draft).length,
      };
    });
    res.json({ ready: true, items });
  }),
);

assignmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(2).max(300),
        subject_id: z.string().uuid().nullable().optional(),
        meta: metaSchema,
      })
      .parse(req.body);
    const { data, error } = await supabase
      .from("assignments")
      .insert({
        user_id: userIdOf(req),
        title: body.title,
        subject_id: body.subject_id ?? null,
        meta: body.meta,
        sections: [],
      })
      .select(FIELDS)
      .single();
    check(error);
    res.status(201).json(data);
  }),
);

/** Lo que se le manda a la web: sin estados colgados (si el servidor se reinició a medias) y con los errores traducidos. */
function present(a: Awaited<ReturnType<typeof own>>, lang: Lang) {
  const running = jobs.has(a.id);
  return {
    ...a,
    running,
    sections: a.sections.map((s) => ({
      ...s,
      status: running ? (s.status ?? null) : null,
      error: s.error
        ? t(
            lang,
            (s.error in ERROR_KEYS ? s.error : "aiUnavailable") as MessageKey,
          )
        : null,
    })),
  };
}
const ERROR_KEYS: Record<string, true> = {
  aiUnavailable: true,
  aiRefused: true,
  aiBadFormat: true,
  unexpected: true,
};

assignmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(
      present(await own(userIdOf(req), req.params.id as string), langOf(req)),
    );
  }),
);

assignmentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const current = await own(userId, req.params.id as string);
    const body = z
      .object({
        title: z.string().trim().min(2).max(300).optional(),
        subject_id: z.string().uuid().nullable().optional(),
        meta: metaSchema.optional(),
        sections: z.array(sectionSchema).max(40).optional(),
      })
      .parse(req.body);
    // La investigación la escribe solo el servidor: se conserva la suya (puede haber terminado mientras ella
    // editaba otra cosa). Lo mismo con el borrador mientras la IA lo está redactando.
    if (body.sections) {
      const prev = new Map(current.sections.map((x) => [x.id, x]));
      body.sections = body.sections.map((x) => {
        const old = prev.get(x.id);
        if (!old)
          return { ...x, research: "", sources: [], status: null, error: null };
        return {
          ...x,
          research: old.research,
          sources: old.sources,
          status: old.status ?? null,
          error: old.error ?? null,
          draft: old.status === "draft" ? old.draft : x.draft,
        };
      });
    }
    const { data, error } = await supabase
      .from("assignments")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select(FIELDS)
      .single();
    check(error);
    res.json(present(data as Awaited<ReturnType<typeof own>>, langOf(req)));
  }),
);

assignmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userIdOf(req));
    check(error);
    res.status(204).end();
  }),
);

/** La IA propone el índice (no se guarda hasta que ella lo acepta). */
assignmentsRouter.post(
  "/:id/outline",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    const notes = formatSources(
      await findSources(userId, a.title, { limit: 5 }),
      a.meta.lang,
    );
    const out = await completeJson(
      outlinePrompt(a.title, a.meta, notes),
      z.object({
        sections: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              goal: z.string().max(1000).default(""),
              words: z.number().int().min(0).max(20000).default(0),
            }),
          )
          .min(2)
          .max(30),
      }),
      { lang: a.meta.lang, effort: "medium", maxTokens: 6000 },
    );
    res.json({
      sections: out.sections.map((s) => ({
        ...s,
        id: randomUUID().slice(0, 8),
        research: "",
        sources: [],
        draft: "",
      })),
    });
  }),
);

// ---------- Investigar y redactar (en segundo plano) ----------
// Tardan de medio minuto a varios minutos: el servidor lo hace por su cuenta y la web va preguntando cómo va.
// Así no se corta aunque ella bloquee el móvil o cambie de app.

const jobs = new Map<string, Promise<void>>();

/** Cambia un apartado leyendo antes lo último guardado (para no pisar lo que ella haya editado mientras). */
async function patchSection(
  userId: string,
  id: string,
  sid: string,
  patch: Partial<Section>,
) {
  const a = await own(userId, id);
  const sections = a.sections.map((x) =>
    x.id === sid ? { ...x, ...patch } : x,
  );
  await saveSections(userId, id, sections);
  return { ...a, sections };
}

async function doStep(
  userId: string,
  id: string,
  sid: string,
  kind: "research" | "draft",
) {
  const a = await patchSection(userId, id, sid, { status: kind, error: null });
  const i = a.sections.findIndex((x) => x.id === sid);
  const s = a.sections[i];
  if (!s) return;
  try {
    if (kind === "research") {
      const notes = formatSources(
        await findSources(userId, `${s.title} ${s.goal}`, { limit: 4 }),
        a.meta.lang,
      );
      const result = await generate(
        (web) =>
          researchPrompt(
            a.title,
            a.meta,
            s,
            a.sections.map((x) => x.title),
            notes,
            web,
          ),
        {
          lang: a.meta.lang,
          effort: "high",
          maxTokens: 12000,
          web: WEB_ENABLED,
          research: true,
        },
      );
      await patchSection(userId, id, sid, {
        research: result.text.slice(0, 40000),
        sources: result.webSources.slice(0, 30).map((w) => ({
          kind: "web" as const,
          site: String(w.site).slice(0, 80),
          title: w.title.slice(0, 300),
          url: w.url.slice(0, 2000),
        })),
        status: null,
      });
    } else {
      const words =
        s.words || Math.round(a.meta.words / Math.max(1, a.sections.length));
      const result = await generate(
        draftPrompt(
          a.title,
          a.meta,
          { ...s, words },
          a.sections.map((x) => x.title),
          s.research,
          a.sections[i - 1]?.draft ?? "",
        ),
        { lang: a.meta.lang, effort: "medium", maxTokens: 8000 },
      );
      await patchSection(userId, id, sid, {
        draft: result.text.slice(0, 60000),
        status: null,
      });
    }
  } catch (err) {
    console.error(`[trabajos] ${kind}:`, err);
    await patchSection(userId, id, sid, {
      status: null,
      error: err instanceof AiError ? err.key : "unexpected",
    }).catch(() => undefined);
    throw err;
  }
}

/** Lanza el trabajo en segundo plano (uno por trabajo a la vez). */
function start(id: string, job: () => Promise<void>) {
  if (jobs.has(id)) throw new HttpError(409, "assignmentBusy");
  const p = job()
    .catch(() => undefined)
    .finally(() => jobs.delete(id));
  jobs.set(id, p);
}

for (const kind of ["research", "draft"] as const) {
  assignmentsRouter.post(
    `/:id/sections/:sid/${kind}`,
    aiLimiter,
    asyncHandler(async (req, res) => {
      const userId = userIdOf(req);
      const a = await own(userId, req.params.id as string);
      const sid = req.params.sid as string;
      if (!a.sections.some((x) => x.id === sid))
        throw new HttpError(404, "assignmentNotFound");
      start(a.id, () => doStep(userId, a.id, sid, kind));
      // Se espera un momento a que quede marcado como "en marcha" antes de contestar.
      await new Promise((r) => setTimeout(r, 300));
      res.status(202).json(present(await own(userId, a.id), langOf(req)));
    }),
  );
}

/** Todo el trabajo de una vez: investiga y redacta, por orden, los apartados que falten. */
assignmentsRouter.post(
  "/:id/auto",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    start(a.id, async () => {
      for (const sid of a.sections.map((x) => x.id)) {
        const s = (await own(userId, a.id)).sections.find((x) => x.id === sid);
        if (!s) continue;
        if (!s.research) await doStep(userId, a.id, sid, "research");
        if (!s.draft) await doStep(userId, a.id, sid, "draft");
      }
    });
    await new Promise((r) => setTimeout(r, 300));
    res.status(202).json(present(await own(userId, a.id), langOf(req)));
  }),
);

/** Revisa un texto suyo: lo que está bien, qué mejorar, correcciones y citas. */
assignmentsRouter.post(
  "/:id/review",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    const { text } = z
      .object({ text: z.string().trim().min(20).max(20000) })
      .parse(req.body);
    const uiLang = langOf(req);
    const result = await generate(reviewPrompt(uiLang, a.title, a.meta, text), {
      lang: uiLang,
      effort: "medium",
      maxTokens: 8000,
    });
    res.json({ review: result.text });
  }),
);
