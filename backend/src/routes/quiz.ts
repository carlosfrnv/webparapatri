import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf, type Lang } from "../i18n";
import { localName } from "../seed";
import { materialInLang } from "../study";
import { supabase } from "../supabase";

/**
 * Simulacro de examen por asignatura y repaso de fallos. No gastan IA: usan las preguntas de los
 * tests que ya se generaron para cada archivo (las identifica el archivo y el número de pregunta).
 */
export const quizRouter = Router();

interface Question {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface QuizItem extends Question {
  document_id: string;
  document_title: string;
  question_index: number;
}

/** Preguntas de los tests de esos archivos, en el idioma de la web. */
async function questionsOf(userId: string, documentIds: string[], lang: Lang) {
  if (documentIds.length === 0) return new Map<string, { title: string; quiz: Question[] }>();
  const { data, error } = await supabase
    .from("study_materials")
    .select("document_id, quiz, lang, translations, documents(title)")
    .eq("user_id", userId)
    .in("document_id", documentIds);
  if (error) throw error;
  const out = new Map<string, { title: string; quiz: Question[] }>();
  for (const row of data ?? []) {
    // Si aún no está traducido, se usan las preguntas originales (mejor eso que nada).
    const quiz = (materialInLang(row, lang)?.quiz ?? row.quiz) as Question[] | null;
    const title = (row.documents as unknown as { title: string } | null)?.title ?? "";
    if (quiz?.length) out.set(row.document_id, { title, quiz });
  }
  return out;
}

const shuffle = <T>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Simulacro: preguntas mezcladas de todos los temas de la asignatura, repartidas entre los temas. */
quizRouter.get(
  "/mock",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const { subject_id, count } = z
      .object({ subject_id: z.string().uuid(), count: z.coerce.number().int().min(5).max(50).catch(20) })
      .parse(req.query);

    const { data: subject } = await supabase
      .from("subjects")
      .select("id, name, translations")
      .eq("id", subject_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!subject) throw new HttpError(404, "invalidSubject");

    const { data: docs, error } = await supabase
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("subject_id", subject_id)
      .eq("source_type", "apuntes")
      .eq("status", "ready");
    if (error) throw error;
    const byDoc = await questionsOf(
      userId,
      (docs ?? []).map((d) => d.id),
      lang,
    );

    // Cada tema aporta sus preguntas barajadas; se van cogiendo por turnos para que salgan todos.
    const pools = shuffle(
      [...byDoc].map(([document_id, { title, quiz }]) =>
        shuffle(quiz.map((q, question_index) => ({ ...q, document_id, document_title: title, question_index }))),
      ),
    );
    const items: QuizItem[] = [];
    while (items.length < count && pools.some((p) => p.length > 0)) {
      for (const pool of pools) {
        const next = pool.pop();
        if (next && items.length < count) items.push(next);
      }
    }

    res.json({
      subject_name: localName(subject, lang),
      items: shuffle(items),
      topics: byDoc.size,
      // Temas listos que aún no tienen test (no se han abierto nunca): no entran en el simulacro.
      missing_topics: (docs ?? []).length - byDoc.size,
    });
  }),
);

const answersSchema = z.object({
  answers: z
    .array(z.object({ document_id: z.string().uuid(), question_index: z.number().int().min(0), correct: z.boolean() }))
    .min(1)
    .max(60),
});

// Si aún no se ha creado la tabla (falta ejecutar el SQL), los fallos simplemente no se guardan.
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/**
 * Respuestas de un test o simulacro: los fallos se guardan para repasarlos y,
 * cuando acierta una pregunta que tenía fallada, sale de la lista.
 */
quizRouter.post(
  "/answers",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { answers } = answersSchema.parse(req.body);
    const docIds = [...new Set(answers.map((a) => a.document_id))];
    const { data: owned } = await supabase.from("documents").select("id").eq("user_id", userId).in("id", docIds);
    const ownedIds = new Set((owned ?? []).map((d) => d.id));
    const valid = answers.filter((a) => ownedIds.has(a.document_id));

    const right = valid.filter((a) => a.correct);
    for (const a of right) {
      const { error } = await supabase
        .from("quiz_mistakes")
        .delete()
        .eq("user_id", userId)
        .eq("document_id", a.document_id)
        .eq("question_index", a.question_index);
      if (missingTable(error?.code)) {
        res.status(204).end();
        return;
      }
      if (error) throw error;
    }

    const wrong = valid.filter((a) => !a.correct);
    if (wrong.length > 0) {
      const { data: existing, error } = await supabase
        .from("quiz_mistakes")
        .select("document_id, question_index, wrong_count")
        .eq("user_id", userId)
        .in("document_id", [...new Set(wrong.map((a) => a.document_id))]);
      if (missingTable(error?.code)) {
        res.status(204).end();
        return;
      }
      if (error) throw error;
      const prev = new Map((existing ?? []).map((m) => [`${m.document_id}:${m.question_index}`, m.wrong_count]));
      const rows = new Map(
        wrong.map((a) => [
          `${a.document_id}:${a.question_index}`,
          {
            user_id: userId,
            document_id: a.document_id,
            question_index: a.question_index,
            wrong_count: (prev.get(`${a.document_id}:${a.question_index}`) ?? 0) + 1,
            last_wrong_at: new Date().toISOString(),
          },
        ]),
      );
      const { error: upsertError } = await supabase.from("quiz_mistakes").upsert([...rows.values()]);
      if (upsertError) throw upsertError;
    }
    res.status(204).end();
  }),
);

/** Preguntas falladas (las más recientes primero), opcionalmente de una asignatura. */
quizRouter.get(
  "/mistakes",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const subjectId = z.string().uuid().optional().catch(undefined).parse(req.query.subject_id);

    const { data: mistakes, error } = await supabase
      .from("quiz_mistakes")
      .select("document_id, question_index, wrong_count, last_wrong_at")
      .eq("user_id", userId)
      .order("last_wrong_at", { ascending: false });
    if (missingTable(error?.code)) {
      res.json({ items: [] });
      return;
    }
    if (error) throw error;

    const { data: docs } = await supabase
      .from("documents")
      .select("id, subject_id")
      .eq("user_id", userId)
      .in("id", [...new Set((mistakes ?? []).map((m) => m.document_id))]);
    const subjectOf = new Map((docs ?? []).map((d) => [d.id, d.subject_id as string | null]));
    const wanted = (mistakes ?? []).filter((m) => !subjectId || subjectOf.get(m.document_id) === subjectId);
    const byDoc = await questionsOf(userId, [...new Set(wanted.map((m) => m.document_id))], lang);

    const items = wanted.flatMap((m) => {
      const doc = byDoc.get(m.document_id);
      const q = doc?.quiz[m.question_index];
      return q
        ? [
            {
              ...q,
              document_id: m.document_id,
              document_title: doc!.title,
              question_index: m.question_index,
              subject_id: subjectOf.get(m.document_id) ?? null,
              wrong_count: m.wrong_count,
            },
          ]
        : [];
    });
    res.json({ items });
  }),
);
