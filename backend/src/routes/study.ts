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
import { materialInLang } from "../study";
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
      .select("document_id, flashcards, lang, translations, documents(title)")
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
    // Por archivo: tarjetas por repasar y total (para separar el repaso por asignatura y tema).
    const byDocument: Record<string, { due: number; total: number }> = {};
    for (const m of materials ?? []) {
      // Las tarjetas en el idioma de la web, si ya están traducidas (mismo orden en los dos idiomas).
      const cards = ((materialInLang(m, langOf(req))?.flashcards ?? m.flashcards ?? []) as Card[]);
      const title = (m.documents as unknown as { title: string } | null)?.title ?? "Documento";
      const counts = (byDocument[m.document_id] = { due: 0, total: cards.length });
      cards.forEach((card, index) => {
        totalCards++;
        const review = reviewMap.get(`${m.document_id}:${index}`);
        if (!review || new Date(review.due_at).getTime() <= now) {
          counts.due++;
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
    res.json({ total_due: due.length, total_cards: totalCards, cards: due.slice(0, limit), by_document: byDocument });
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
      .select("quiz, lang, translations")
      .eq("document_id", body.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    const quiz = material ? (materialInLang(material, langOf(req))?.quiz ?? material.quiz) : null;
    const question = (quiz as { question: string; options: string[]; correct_index: number }[] | null)?.[
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
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

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
        .gte("reviewed_at", monthAgo.toISOString()),
      supabase
        .from("quiz_attempts")
        .select("score, total, created_at, documents(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("documents")
        .select("id, title, status, created_at")
        .eq("user_id", userId)
        .eq("source_type", "apuntes")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Repasos por día (fecha AAAA-MM-DD en UTC) en los últimos 30 días.
    const perDay = new Map<string, number>();
    for (const r of reviewsWeek.data ?? []) {
      const day = (r.reviewed_at as string).slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    const dayKey = (offset: number) => new Date(Date.now() - offset * 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Actividad de los últimos 7 días, del más antiguo a hoy.
    const week = Array.from({ length: 7 }, (_, i) => ({ date: dayKey(6 - i), count: perDay.get(dayKey(6 - i)) ?? 0 }));
    const studyDays = week.filter((d) => d.count > 0).length;
    // Racha: días seguidos con repasos hasta hoy (si hoy aún no ha repasado, cuenta desde ayer).
    let streak = 0;
    for (let i = perDay.has(dayKey(0)) ? 0 : 1; i < 30 && perDay.has(dayKey(i)); i++) streak++;
    const quizzes = attempts.data ?? [];
    const quizAvg = quizzes.length
      ? Math.round((quizzes.reduce((sum, a) => sum + a.score / a.total, 0) / quizzes.length) * 100)
      : null;

    res.json({
      documents: docs.count ?? 0,
      reviewed_today: reviewsToday.count ?? 0,
      study_days_week: studyDays,
      week,
      streak,
      quiz_avg: quizAvg,
      recent_quizzes: quizzes.slice(0, 5).map((a) => ({
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
    const subjectId = z.string().uuid().optional().catch(undefined).parse(req.query.subject_id);
    const userId = userIdOf(req);
    // Incluye la biblioteca de referencia (aparece identificada como tal en los resultados),
    // salvo si se busca dentro de una asignatura: entonces, solo sus apuntes.
    let sources = await findSources(userId, q, { limit: subjectId ? 40 : 20, includeReference: !subjectId });
    if (subjectId) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id")
        .eq("user_id", userId)
        .eq("subject_id", subjectId);
      const ids = new Set((docs ?? []).map((d) => d.id));
      sources = sources.filter((s) => ids.has(s.document_id)).slice(0, 20);
    }
    res.json(sources.map(({ content: _c, rank: _r, coverage: _v, proximity: _p, ...s }) => s));
  }),
);
