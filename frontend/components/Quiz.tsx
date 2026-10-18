"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { QuizItem } from "@/lib/types";
import { Markdown, Spinner } from "./ui";

const LETTERS = ["A", "B", "C", "D"];

/** Guarda si ha acertado o fallado: los fallos van al "repaso de fallos" y los aciertos los quitan. */
export function saveAnswers(answers: { document_id: string; question_index: number; correct: boolean }[]) {
  if (answers.length > 0) api.post("/quiz/answers", { answers }).catch(() => undefined);
}

/**
 * Test de opción múltiple con corrección inmediata y explicación.
 * Con `documentId` es el test de un archivo (se guarda la nota); sin él, un repaso de preguntas sueltas.
 */
export function Quiz({
  documentId,
  questions,
  onDone,
}: {
  documentId?: string;
  questions: QuizItem[];
  onDone?: () => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [extra, setExtra] = useState<Record<number, string>>({});
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [finished, setFinished] = useState(false);

  const q = questions[index];
  const chosen = answers[index];
  const score = answers.filter((a, i) => a === questions[i].correct_index).length;

  function choose(option: number) {
    if (chosen !== null) return;
    setAnswers((a) => a.map((v, i) => (i === index ? option : v)));
    saveAnswers([
      { document_id: q.document_id, question_index: q.question_index, correct: option === q.correct_index },
    ]);
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      setFinished(true);
      if (documentId)
        api.post("/quiz/attempts", { document_id: documentId, score, total: questions.length }).catch(() => undefined);
    }
  }

  async function explainMore() {
    if (chosen === null) return;
    setLoadingExtra(true);
    try {
      const { explanation } = await api.post<{ explanation: string }>("/quiz/explain", {
        document_id: q.document_id,
        question_index: q.question_index,
        chosen_index: chosen,
      });
      setExtra((e) => ({ ...e, [index]: explanation }));
    } catch (err) {
      setExtra((e) => ({ ...e, [index]: errorMessage(err) }));
    } finally {
      setLoadingExtra(false);
    }
  }

  function restart() {
    setAnswers(questions.map(() => null));
    setExtra({});
    setIndex(0);
    setFinished(false);
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="text-5xl" aria-hidden="true">
          {pct >= 80 ? "🏆" : pct >= 50 ? "👏" : "💪"}
        </span>
        <p className="text-3xl font-bold">
          {score} / {questions.length}
        </p>
        <p className="text-muted">{t.quiz.result(pct)}</p>
        {onDone ? (
          <button className="btn-primary" onClick={onDone}>
            {t.quiz.finish}
          </button>
        ) : (
          <button className="btn-primary" onClick={restart}>
            {t.quiz.restart}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-muted mb-3 flex justify-between text-sm">
        <span>{t.quiz.questionOf(index + 1, questions.length)}</span>
        <span>{t.quiz.correctCount(score)}</span>
      </div>
      <div className="card p-5">
        {!documentId && q.document_title && (
          <p className="text-accent mb-2 text-xs font-semibold">{q.document_title}</p>
        )}
        <p className="text-lg font-medium">{q.question}</p>
        <ul className="mt-4 space-y-2">
          {q.options.map((opt, i) => {
            let cls = "border-border hover:border-accent";
            if (chosen !== null) {
              if (i === q.correct_index) cls = "border-success bg-success-soft";
              else if (i === chosen) cls = "border-danger bg-danger-soft";
              else cls = "border-border opacity-70";
            }
            return (
              <li key={i}>
                <button
                  className={`flex min-h-12 w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${cls}`}
                  onClick={() => choose(i)}
                  disabled={chosen !== null}
                  aria-pressed={chosen === i}
                >
                  <span className="font-semibold">{LETTERS[i]})</span>
                  <span>{opt}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {chosen !== null && (
          <div className="bg-surface-2 mt-4 rounded-xl p-4">
            <p className="font-semibold">
              {chosen === q.correct_index ? t.quiz.right : t.quiz.wrong(LETTERS[q.correct_index])}
            </p>
            <p className="mt-2">{q.explanation}</p>
            {extra[index] ? (
              <div className="border-border mt-3 border-t pt-3">
                <Markdown>{extra[index]}</Markdown>
              </div>
            ) : loadingExtra ? (
              <div className="mt-3">
                <Spinner label={t.quiz.explaining} />
              </div>
            ) : (
              <button className="btn-ghost text-accent mt-2 px-0" onClick={explainMore}>
                {t.quiz.explainMore}
              </button>
            )}
          </div>
        )}
      </div>

      {chosen !== null && (
        <button className="btn-primary mt-4 w-full" onClick={next}>
          {index + 1 < questions.length ? t.quiz.next : t.quiz.seeResult}
        </button>
      )}
    </div>
  );
}
