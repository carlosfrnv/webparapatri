import { Router } from "express";
import { z } from "zod";
import { complete } from "../ai";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { aiLimiter } from "../limits";
import { quizExplainPrompt } from "../prompts";
import { findSources, formatSources } from "../search";
import { sm2 } from "../sm2";
import { supabase } from "../supabase";

export const studyRouter = Router();

interface Card {
  front: string;
  back: string;
}

/** Tarjetas por repasar: las nuevas (sin repaso) y las que ya han llegado a su fecha. */
studyRouter.get(
  "/flashcards/due",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const documentId = typeof req.query.document_id === "string" ? req.query.document_id : undefined;
    const subjectId = typeof req.query.subject_id === "string" ? req.query.subject_id : undefined;
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    // Solo las de una asignatura (p. ej., para preparar un examen).
    let subjectDocs: string[] | undefined;
    if (subjectId) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id")
        .eq("user_id", userId)
        .eq("subject_id", subjectId);
      subjectDocs = (docs ?? []).map((d) => d.id);
    }

    let materialsQuery = supabase
      .from("study_materials")
      .select("document_id, flashcards, documents(title)")
      .eq("user_id", userId);
    if (documentId) materialsQuery = materialsQuery.eq("document_id", documentId);
    if (subjectDocs) materialsQuery = materialsQuery.in("document_id", subjectDocs);
    const { data: materials, error } = await materialsQuery;
    if (error) throw error;

    let reviewsQuery = supabase
      .from("flashcard_reviews")
      .select("document_id, card_index, due_at, interval_days")
      .eq("user_id", userId);
    if (documentId) reviewsQuery = reviewsQuery.eq("document_id", documentId);
    if (subjectDocs) reviewsQuery = reviewsQuery.in("document_id", subjectDocs);
    const { data: reviews } = await reviewsQuery;
    const reviewMap = new Map((reviews ?? []).map((r) => [`${r.document_id}:${r.card_index}`, r]));

    const now = Date.now();
    const due: { document_id: string; document_title: string; card_index: number; front: string; back: string; is_new: boolean; due_at: string | null }[] = [];
    let totalCards = 0;
    for (const m of materials ?? []) {
      const cards = (m.flashcards ?? []) as Card[];
      const title = (m.documents as unknown as { title: string } | null)?.title ?? "Documento";
      cards.forEach((card, index) => {
        totalCards++;
        const review = reviewMap.get(`${m.document_id}:${index}`);
        if (!review || new Date(review.due_at).getTime() <= now) {
          due.push({
            document_id: m.document_id,
            document_title: title,
            card_index: index,
            front: card.front,
            back: card.back,
            is_new: !review,
            due_at: review?.due_at ?? null,
          });
        }
      });
    }
    // Primero los repasos atrasados, luego las nuevas.
    due.sort((a, b) => Number(a.is_new) - Number(b.is_new) || (a.due_at ?? "").localeCompare(b.due_at ?? ""));
    res.json({ total_due: due.length, total_cards: totalCards, cards: due.slice(0, limit) });
  }),
);

const reviewSchema = z.object({
  document_id: z.string().uuid(),
  card_index: z.number().int().min(0),
  quality: z.number().int().min(0).max(5),
});

studyRouter.post(
  "/flashcards/review",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = reviewSchema.parse(req.body);
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", body.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!doc) throw new HttpError(404, "documentNotFound");

    const { data: prev } = await supabase
      .from("flashcard_reviews")
      .select("ease, interval_days, review_count")
      .eq("user_id", userId)
      .eq("document_id", body.document_id)
      .eq("card_index", body.card_index)
      .maybeSingle();

    const next = sm2({ ease: prev?.ease ?? 2.5, interval_days: prev?.interval_days ?? 0 }, body.quality);
    const { error } = await supabase.from("flashcard_reviews").upsert(
      {
        user_id: userId,
        document_id: body.document_id,
        card_index: body.card_index,
        ...next,
        last_quality: body.quality,
        review_count: (prev?.review_count ?? 0) + 1,
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "document_id,card_index" },
    );
    if (error) throw error;
    res.json(next);
  }),
);

const explainSchema = z.object({
  document_id: z.string().uuid(),
  question_index: z.number().int().min(0),
  chosen_index: z.number().int().min(0).max(3),
});

studyRouter.post(
  "/quiz/explain",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = explainSchema.parse(req.body);
    const { data: material } = await supabase
      .from("study_materials")
      .select("quiz")
      .eq("document_id", body.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    const question = (material?.quiz as { question: string; options: string[]; correct_index: number }[] | null)?.[
      body.question_index
    ];
    if (!question) throw new HttpError(404, "questionNotFound");

    const lang = langOf(req);
    const sources = await findSources(userId, question.question, {
      documentId: body.document_id,
      limit: 4,
    });
    const explanation = await complete(
      quizExplainPrompt(lang, question.question, question.options, question.correct_index, body.chosen_index, formatSources(sources, lang)),
      { lang, effort: "low", maxTokens: 4000 },
    );
    res.json({ explanation });
  }),
);

const attemptSchema = z.object({
  document_id: z.string().uuid(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
});

studyRouter.post(
  "/quiz/attempts",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = attemptSchema.parse(req.body);
    const { error } = await supabase.from("quiz_attempts").insert({ ...body, user_id: userId });
    if (error) throw error;
    res.status(201).json({ ok: true });
  }),
);

/** Panel de progreso de la página de inicio. */
studyRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const [docs, reviewsToday, reviewsWeek, attempts, recentDocs] = await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source_type", "apuntes"),
      supabase
        .from("flashcard_reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("reviewed_at", startOfDay.toISOString()),
      supabase
        .from("flashcard_reviews")
        .select("reviewed_at")
        .eq("user_id", userId)
        .gte("reviewed_at", weekAgo.toISOString()),
      supabase
        .from("quiz_attempts")
        .select("score, total, created_at, documents(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("documents")
        .select("id, title, status, created_at")
        .eq("user_id", userId)
        .eq("source_type", "apuntes")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Días distintos con estudio en los últimos 7 días.
    const studyDays = new Set((reviewsWeek.data ?? []).map((r) => (r.reviewed_at as string).slice(0, 10))).size;

    res.json({
      documents: docs.count ?? 0,
      reviewed_today: reviewsToday.count ?? 0,
      study_days_week: studyDays,
      recent_quizzes: (attempts.data ?? []).map((a) => ({
        score: a.score,
        total: a.total,
        created_at: a.created_at,
        title: (a.documents as unknown as { title: string } | null)?.title ?? "Documento",
      })),
      recent_documents: recentDocs.data ?? [],
    });
  }),
);

/** Buscador en el temario (sin IA). */
studyRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = z.string().trim().min(2).max(200).parse(req.query.q);
    // Incluye la biblioteca de referencia (aparece identificada como tal en los resultados).
    const sources = await findSources(userIdOf(req), q, { limit: 20, includeReference: true });
    res.json(sources.map(({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s));
  }),
);
