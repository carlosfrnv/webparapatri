import { randomUUID } from "node:crypto";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { AiError, completeJson, generate } from "../ai";
import {
  type AssignmentMeta,
  draftPrompt,
  outlinePrompt,
  queriesPrompt,
  researchFromArticlesPrompt,
  researchPrompt,
  reviewPrompt,
  sourcesPrompt,
  splitDraft,
  splitLegacyDraft,
} from "../assignments";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf, type Lang, type MessageKey, t } from "../i18n";
import { aiLimiter } from "../limits";
import { findSources, formatSources } from "../search";
import { formatReference, inTextCite, searchArticles } from "../scholar";
import {
  cleanResearchSources,
  hasSourceList,
  withSourceList,
} from "../linkcheck";
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
  // Portada del Word (la rellena ella en la pestaña "Portada").
  cover: z
    .object({
      institution: z.string().max(300).default(""),
      course: z.string().max(300).default(""),
      subject: z.string().max(300).default(""),
      title: z.string().max(400).default(""),
      subtitle: z.string().max(300).default(""),
      authors: z.string().max(600).default(""),
      number: z.string().max(200).default(""),
      teacher: z.string().max(300).default(""),
      year: z.string().max(100).default(""),
      place: z.string().max(100).default(""),
      date: z.string().max(100).default(""),
      toc: z.boolean().default(true),
    })
    .optional(),
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
  // Avisos de la IA para ella sobre el borrador (se ven aparte y no van al Word).
  notes: z.string().max(4000).default(""),
  // Si las referencias de la investigación ya se han comprobado (enlaces y DOI que existen).
  checked: z.boolean().default(false),
  // Lo que la IA está haciendo ahora con este apartado y, si falló, por qué (código del mensaje).
  status: z
    .enum(["research", "draft", "queued", "translate"])
    .nullable()
    .optional(),
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

/** Avisos que borradores antiguos llevaban dentro del texto: se pasan al recuadro aparte. */
function legacy(s: Section) {
  const split = !s.notes && s.draft ? splitLegacyDraft(s.draft) : null;
  return split ? { draft: split.body, notes: split.notes } : {};
}

/** Lo que se le manda a la web: sin estados colgados (si el servidor se reinició a medias) y con los errores traducidos. */
function present(a: Awaited<ReturnType<typeof own>>, lang: Lang) {
  const running = queues.has(a.id);
  return {
    ...a,
    running,
    sections: a.sections.map((s) => ({
      ...s,
      ...legacy(s),
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
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    res.json({
      ...present(a, langOf(req)),
      cover_defaults: a.meta.cover ? null : await coverDefaults(userId, a.id),
    });
  }),
);

/** Para una portada nueva: sus datos personales de la última portada que rellenó (nombre, número, escuela…). */
async function coverDefaults(userId: string, exceptId: string) {
  const { data } = await supabase
    .from("assignments")
    .select("id, meta")
    .eq("user_id", userId)
    .neq("id", exceptId)
    .order("updated_at", { ascending: false })
    .limit(20);
  const cover = (data ?? [])
    .map((x) => (x.meta as AssignmentMeta | null)?.cover)
    .find((c) => typeof c?.authors === "string" && c.authors.trim());
  if (!cover) return null;
  const pick = (k: string) =>
    typeof cover[k] === "string" ? (cover[k] as string) : "";
  return {
    authors: pick("authors"),
    number: pick("number"),
    institution: pick("institution"),
    course: pick("course"),
    place: pick("place"),
  };
}

// Cada trabajo se guarda entero: las escrituras al mismo trabajo van de una en una para que ninguna pise a otra
// (p. ej., una edición suya justo cuando termina una investigación).
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const tail = next.catch(() => undefined);
  locks.set(id, tail);
  void tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return next;
}

assignmentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const id = req.params.id as string;
    const data = await withLock(id, () =>
      patchAssignment(userId, id, req.body),
    );
    res.json(present(data, langOf(req)));
  }),
);

async function patchAssignment(userId: string, id: string, input: unknown) {
  const current = await own(userId, id);
  const body = z
    .object({
      title: z.string().trim().min(2).max(300).optional(),
      subject_id: z.string().uuid().nullable().optional(),
      meta: metaSchema.optional(),
      sections: z.array(sectionSchema).max(40).optional(),
    })
    .parse(input);
  // Al guardar los datos del trabajo no se pierde la portada (ese formulario no la envía).
  if (body.meta && !body.meta.cover && current.meta.cover)
    body.meta.cover = current.meta.cover as z.infer<typeof metaSchema>["cover"];
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
        notes: old.status === "draft" ? old.notes : x.notes,
        checked: old.checked ?? false,
      };
    });
  }
  const { data, error } = await supabase
    .from("assignments")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select(FIELDS)
    .single();
  check(error);
  return data as Awaited<ReturnType<typeof own>>;
}

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
      { lang: a.meta.lang, effort: "medium", patient: true, maxTokens: 6000 },
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

// Cola por trabajo: ella puede pedir varios apartados seguidos y la IA los hace de uno en uno
// (a la vez chocaría con el límite por minuto de la IA).
interface Step {
  sid: string;
  kind: "research" | "draft" | "translate";
  // "Hacer el trabajo entero" y "Buscar referencias": solo si aún no está hecho.
  ifMissing?: boolean;
}
const queues = new Map<string, Step[]>();

/** Cambia un apartado leyendo antes lo último guardado (para no pisar lo que ella haya editado mientras). */
async function patchSection(
  userId: string,
  id: string,
  sid: string,
  patch: Partial<Section>,
) {
  return withLock(id, async () => {
    const a = await own(userId, id);
    const sections = a.sections.map((x) =>
      x.id === sid ? { ...x, ...patch } : x,
    );
    await saveSections(userId, id, sections);
    return { ...a, sections };
  });
}

async function doStep(
  userId: string,
  id: string,
  sid: string,
  kind: "research" | "draft",
): Promise<void> {
  // Sin investigación el borrador no tendría datos ni citas: se investiga antes, sola.
  if (kind === "draft") {
    const cur = (await own(userId, id)).sections.find((x) => x.id === sid);
    if (cur && !cur.research.trim()) await doStep(userId, id, sid, "research");
  }
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
      const all = a.sections.map((x) => x.title);
      // 1) Gratis: artículos científicos reales (Europe PMC) y una IA gratuita, sin búsqueda web.
      const free = await researchFromArticles(
        a.title,
        a.meta,
        s,
        all,
        notes,
      ).catch((err) => {
        console.warn("[trabajos] artículos:", err);
        return null;
      });
      if (free) {
        await patchSection(userId, id, sid, {
          research: free.research.slice(0, 40000),
          checked: true,
          sources: free.sources,
          status: null,
        });
        return;
      }
      // 2) Si no hay artículos sobre el tema: búsqueda web, solo con las IA gratuitas (Claude, sin web).
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
          paidWeb: false,
          patient: true,
        },
      );
      // Una investigación vacía no sirve (y dejaría el borrador sin fuentes): mejor avisar del fallo.
      if (result.text.trim().length < 80) throw new AiError("aiUnavailable");
      // Sin lista de fuentes la bibliografía quedaría vacía: se monta aparte con lo que citó y consultó.
      if (!hasSourceList(result.text)) {
        const list = await generate(
          sourcesPrompt(a.meta, result.text, result.webSources),
          {
            lang: a.meta.lang,
            effort: "low",
            maxTokens: 3000,
            patient: true,
          },
        ).catch(() => null);
        const lines = (list?.text ?? "")
          .split("\n")
          .filter((l) => /^\s*[-*•]\s+\S/.test(l));
        if (lines.length)
          result.text = withSourceList(
            result.text,
            lines,
            a.meta.lang === "pt" ? "Fontes" : "Fuentes",
          );
      }
      // Se comprueban solas las referencias y se quitan las que no existen (así ella no tiene que abrirlas).
      const cleaned = await cleanResearchSources(result.text).catch(() => ({
        research: result.text,
        dead: [] as string[],
        checked: 0,
      }));
      const alive = result.webSources.filter(
        (w) =>
          !cleaned.dead.some((d) => w.url.startsWith(d) || d.startsWith(w.url)),
      );
      await patchSection(userId, id, sid, {
        research: cleaned.research.slice(0, 40000),
        checked: true,
        sources: alive.slice(0, 30).map((w) => ({
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
        { lang: a.meta.lang, effort: "medium", maxTokens: 8000, patient: true },
      );
      await patchSection(userId, id, sid, {
        draft: splitDraft(result.text).body.slice(0, 60000),
        notes: splitDraft(result.text).notes.slice(0, 4000),
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

/**
 * Investigación con artículos de Europe PMC: la IA (gratuita) escribe las ideas clave a partir de sus resúmenes y la
 * lista de fuentes se monta con los datos reales (autores, año, revista, DOI). Solo APA: en Vancouver los números
 * dependen del orden de todo el trabajo. Devuelve null si no hay artículos suficientes.
 */
async function researchFromArticles(
  title: string,
  meta: AssignmentMeta,
  s: { title: string; goal: string },
  all: string[],
  notes: string,
) {
  if (meta.citation !== "APA") return null;
  const { queries } = await completeJson(
    queriesPrompt(title, s),
    z.object({ queries: z.array(z.string()).min(1) }),
    {
      lang: meta.lang,
      effort: "low",
      maxTokens: 1500,
      patient: true,
    },
  ).catch(() => ({ queries: [s.title] }));
  const articles = await searchArticles(queries, 6);
  if (articles.length < 2) return null;
  const result = await generate(
    researchFromArticlesPrompt(
      title,
      meta,
      s,
      all,
      notes,
      articles.map((x) => ({
        cite: inTextCite(x),
        title: x.title,
        journal: x.journal,
        abstract: x.abstract,
      })),
    ),
    { lang: meta.lang, effort: "medium", maxTokens: 6000, patient: true },
  );
  const ideas = result.text
    .replace(/\n[ \t]*#{1,4}[ \t]*(?:Fontes|Fuentes|Refer)[\s\S]*$/i, "")
    .trim();
  if (ideas.length < 80) return null;
  // En la bibliografía, solo los artículos que de verdad ha citado.
  const used = articles.filter(
    (x) =>
      ideas.includes(x.authors[0]?.last ?? x.collective ?? "\u0000") &&
      ideas.includes(x.year),
  );
  if (!used.length) return null;
  return {
    research: `${ideas}\n### ${meta.lang === "pt" ? "Fontes" : "Fuentes"}\n${used.map((x) => `- ${formatReference(x, "APA")}`).join("\n")}`,
    sources: used.map((x) => ({
      kind: "web" as const,
      site: (x.journal || "PubMed").slice(0, 80),
      title: x.title.slice(0, 300),
      url: x.url.slice(0, 2000),
    })),
  };
}

/** Añade pasos a la cola del trabajo (sin repetir) y, si no estaba en marcha, la arranca. */
async function enqueue(userId: string, id: string, steps: Step[]) {
  const queue = queues.get(id) ?? [];
  const fresh = steps.filter(
    (st) => !queue.some((q) => q.sid === st.sid && q.kind === st.kind),
  );
  queue.push(...fresh);
  // Los que esperan se marcan "en cola" (los que ya están en marcha conservan su estado).
  const waiting = new Set(fresh.map((st) => st.sid));
  await withLock(id, async () => {
    const a = await own(userId, id);
    await saveSections(
      userId,
      id,
      a.sections.map((x) =>
        waiting.has(x.id) && !x.status
          ? { ...x, status: "queued" as const, error: null }
          : x,
      ),
    );
  });
  if (queues.has(id)) return;
  queues.set(id, queue);
  void (async () => {
    try {
      for (let st = queue.shift(); st; st = queue.shift()) {
        const cur = (await own(userId, id)).sections.find(
          (x) => x.id === st!.sid,
        );
        if (!cur) continue;
        const done =
          st.kind === "research"
            ? !!cur.research.trim()
            : st.kind === "draft"
              ? !!cur.draft.trim()
              : false;
        if (st.ifMissing && done) {
          if (cur.status === "queued" && !queue.some((q) => q.sid === cur.id))
            await patchSection(userId, id, cur.id, { status: null });
          continue;
        }
        try {
          if (st.kind === "translate")
            await translateSection(userId, id, st.sid);
          else await doStep(userId, id, st.sid, st.kind);
        } catch (err) {
          // Si la IA no está disponible, no tiene sentido seguir: se vacía la cola.
          if (err instanceof AiError && err.key === "aiUnavailable")
            queue.length = 0;
        }
      }
    } finally {
      queues.delete(id);
      // Ningún apartado se queda marcado "en cola" si la cola se cortó.
      await withLock(id, async () => {
        const a2 = await own(userId, id);
        if (a2.sections.some((x) => x.status === "queued"))
          await saveSections(
            userId,
            id,
            a2.sections.map((x) =>
              x.status === "queued" ? { ...x, status: null } : x,
            ),
          );
      }).catch(() => undefined);
    }
  })();
}

async function reply(req: Request, res: Response, userId: string, id: string) {
  await new Promise((r) => setTimeout(r, 300));
  res.status(202).json(present(await own(userId, id), langOf(req)));
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
      await enqueue(userId, a.id, [{ sid, kind }]);
      await reply(req, res, userId, a.id);
    }),
  );
}

/** Bibliografía: investiga (sin tocar los borradores) los apartados que aún no tienen fuentes. */
assignmentsRouter.post(
  "/:id/references",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    await enqueue(
      userId,
      a.id,
      a.sections
        .filter((x) => !x.research.trim())
        .map((x) => ({
          sid: x.id,
          kind: "research" as const,
          ifMissing: true,
        })),
    );
    await reply(req, res, userId, a.id);
  }),
);

/** Pasa un apartado ya escrito al portugués europeo (título, objetivo, borrador y avisos). */
async function translateSection(userId: string, id: string, sid: string) {
  const a = await patchSection(userId, id, sid, {
    status: "translate",
    error: null,
  });
  const s = a.sections.find((x) => x.id === sid);
  if (!s) return;
  try {
    const out = await completeJson(
      `Traduce al PORTUGUÊS EUROPEU (novo Acordo Ortográfico) este apartado de un trabajo académico de 1.º de la
Licenciatura em Imagem Médica e Radioterapia (Portugal). Es una traducción, no un resumen: conserva todo el contenido,
los párrafos y las listas tal cual.
- Terminología técnica portuguesa de Portugal (radiofármaco, tomografia computorizada, positrão, gamacâmara, ecografia…).
- Citas: mantenlas exactamente (autor, año, página); en las narrativas "y" pasa a "e"; "s. f." pasa a "s.d."; "et al." igual.
- Siglas: usa la forma portuguesa habitual (TC, RM, OMS, DGS…) y en la primera aparición el nombre en portugués.
- Mantén la numeración del título si la tiene. Si un campo está vacío, déjalo vacío.
Responde SOLO con JSON {"title":"...","goal":"...","draft":"...","notes":"..."}.
TÍTULO: ${s.title}
OBJETIVO: ${s.goal}
BORRADOR:
${s.draft}
AVISOS:
${s.notes ?? ""}`,
      z.object({
        title: z.string().min(1).max(200),
        goal: z.string().max(1000).default(""),
        draft: z.string().max(60000).default(""),
        notes: z.string().max(4000).default(""),
      }),
      { lang: "pt", effort: "low", maxTokens: 12000, patient: true },
    );
    // Si el borrador era largo y la traducción sale muy corta, mejor no perder el texto: se avisa del fallo.
    if (s.draft && out.draft.length < s.draft.length * 0.6)
      throw new AiError("aiBadFormat");
    await patchSection(userId, id, sid, { ...out, status: null });
  } catch (err) {
    console.error("[trabajos] traducir:", err);
    await patchSection(userId, id, sid, {
      status: null,
      error: err instanceof AiError ? err.key : "unexpected",
    }).catch(() => undefined);
    throw err;
  }
}

/** La portada ya guardada en español: los textos por defecto pasan a portugués (lo que ella escribió, no). */
export function coverToPt(cover: Record<string, string | boolean>) {
  const months: Record<string, string> = {
    enero: "janeiro",
    febrero: "fevereiro",
    marzo: "março",
    abril: "abril",
    mayo: "maio",
    junio: "junho",
    julio: "julho",
    agosto: "agosto",
    septiembre: "setembro",
    octubre: "outubro",
    noviembre: "novembro",
    diciembre: "dezembro",
  };
  const fixed: Record<string, string> = {
    "Licenciatura en Imagen Médica y Radioterapia":
      "Licenciatura em Imagem Médica e Radioterapia",
    "1.º curso": "1.º ano",
    "2.º curso": "2.º ano",
    "3.º curso": "3.º ano",
    "4.º curso": "4.º ano",
    "1.er semestre": "1.º semestre",
    "Trabajo escrito": "Trabalho escrito",
  };
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(cover)) {
    if (typeof v !== "string") out[k] = v;
    else if (k === "date")
      out[k] = v.replace(
        /([A-Za-zñ]+)(\s+de)?(\s+\d{4})/,
        (m, mes: string, _de: string, year: string) =>
          months[mes.toLowerCase()] ? `${months[mes.toLowerCase()]}${year}` : m,
      );
    else out[k] = fixed[v.trim()] ?? v;
  }
  return out;
}

/** Pasa todo el trabajo al portugués (la escuela pide entregarlos en portugués). */
assignmentsRouter.post(
  "/:id/translate",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const id = req.params.id as string;
    const a = await withLock(id, async () => {
      const cur = await own(userId, id);
      const meta = {
        ...cur.meta,
        lang: "pt" as const,
        kind:
          cur.meta.kind === "Trabajo escrito"
            ? "Trabalho escrito"
            : cur.meta.kind,
        cover: cur.meta.cover ? coverToPt(cur.meta.cover) : undefined,
      };
      const { error } = await supabase
        .from("assignments")
        .update({ meta, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      check(error);
      return { ...cur, meta };
    });
    await enqueue(
      userId,
      a.id,
      a.sections.map((x) => ({ sid: x.id, kind: "translate" as const })),
    );
    await reply(req, res, userId, a.id);
  }),
);

/** Todo el trabajo de una vez: investiga y redacta, por orden, los apartados que falten. */
assignmentsRouter.post(
  "/:id/auto",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    await enqueue(
      userId,
      a.id,
      a.sections
        .filter((x) => !x.draft.trim())
        .map((x) => ({ sid: x.id, kind: "draft" as const, ifMissing: true })),
    );
    await reply(req, res, userId, a.id);
  }),
);

/**
 * Lista de siglas y acrónimos y lista de símbolos (obligatorias según la guía de la escuela) a partir del texto.
 * Se piden al descargar el Word.
 */
assignmentsRouter.post(
  "/:id/lists",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const a = await own(userId, req.params.id as string);
    const text = a.sections
      .map((s) => `${s.title}\n${s.draft}`)
      .join("\n\n")
      .slice(0, 60000);
    if (!text.trim()) {
      res.json({ siglas: [], simbolos: [] });
      return;
    }
    const lang = a.meta.lang;
    const out = await completeJson(
      `Este es el texto de un trabajo académico en ${lang === "pt" ? "português europeu" : "español"}.
Haz las dos listas que exige la escuela:
1. "siglas": TODAS las abreviaturas, siglas y acrónimos que aparecen en el texto (OMS, PET, SPECT, TC, IAEA, DGS…),
   cada una con su significado completo tal y como se usa en el texto (en el idioma del trabajo; si es una institución
   extranjera, su nombre oficial). Sin repetir. No incluyas "et al.", "p.", "s.d." ni "s. f.".
2. "simbolos": los símbolos que aparecen (%, ≠, ≈, ±, °C, ×…) con su significado. Las unidades (keV, mSv, Gy…) cuentan
   como símbolos solo si aparecen. Si no hay, lista vacía.
TEXTO:
${text}

Responde SOLO con JSON: {"siglas":[{"sigla":"OMS","significado":"Organização Mundial da Saúde"}],"simbolos":[{"simbolo":"%","significado":"Percentagem"}]}`,
      z.object({
        siglas: z
          .array(
            z.object({
              sigla: z.string().min(1).max(30),
              significado: z.string().min(1).max(300),
            }),
          )
          .max(120)
          .default([]),
        simbolos: z
          .array(
            z.object({
              simbolo: z.string().min(1).max(20),
              significado: z.string().min(1).max(200),
            }),
          )
          .max(60)
          .default([]),
      }),
      { lang, effort: "low", patient: true, maxTokens: 4000 },
    );
    const seen = new Set<string>();
    const siglas = out.siglas
      .filter(
        (x) =>
          !seen.has(x.sigla.toUpperCase()) && seen.add(x.sigla.toUpperCase()),
      )
      .sort((x, y) =>
        x.sigla.localeCompare(y.sigla, lang, { sensitivity: "base" }),
      );
    res.json({ siglas, simbolos: out.simbolos });
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
      patient: true,
      maxTokens: 8000,
    });
    res.json({ review: result.text });
  }),
);
