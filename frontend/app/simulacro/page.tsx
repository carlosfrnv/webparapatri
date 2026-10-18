"use client";

import { Exam, Timer } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { saveAnswers } from "@/components/Quiz";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { QuizItem } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];
const COUNTS = [10, 20, 30];
const SECONDS_PER_QUESTION = 60;

interface MockResponse {
  subject_name: string;
  items: QuizItem[];
  topics: number;
  missing_topics: number;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Examen: se responde todo sin ver la corrección y al entregar sale la nota, por temas y las falladas. */
function MockExam({
  items,
  timed,
  onFinish,
}: {
  items: QuizItem[];
  timed: boolean;
  onFinish: (a: (number | null)[], timeUp: boolean) => void;
}) {
  const t = useT();
  const tm = t.mock;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => items.map(() => null));
  const [left, setLeft] = useState(items.length * SECONDS_PER_QUESTION);

  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => setLeft((sec) => Math.max(0, sec - 1)), 1000);
    return () => clearInterval(id);
  }, [timed]);

  // Al llegar a cero se entrega solo, con lo que haya respondido.
  const done = timed && left === 0;
  useEffect(() => {
    if (done) onFinish(answers, true);
  }, [done, answers, onFinish]);

  const q = items[index];
  const answered = answers.filter((a) => a !== null).length;

  function submit() {
    const missing = items.length - answered;
    if (missing > 0 && !confirm(tm.confirmSubmit(missing))) return;
    onFinish(answers, false);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-muted mb-3 flex items-center justify-between gap-3 text-sm">
        <span>
          {t.quiz.questionOf(index + 1, items.length)} · {tm.answered(answered, items.length)}
        </span>
        {timed && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${
              left <= 60 ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
            }`}
            aria-label={tm.timeLeft}
          >
            <Timer size={16} weight="bold" aria-hidden="true" /> {clock(left)}
          </span>
        )}
      </div>

      {/* Mapa de preguntas: se puede saltar a cualquiera */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={t.quiz.questionOf(i + 1, items.length)}
            className={`h-8 w-8 rounded-lg text-xs font-semibold ${
              i === index
                ? "bg-accent text-white"
                : answers[i] !== null
                  ? "bg-accent-soft text-accent"
                  : "bg-surface-2 text-muted"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="card p-5">
        <p className="text-lg font-medium">{q.question}</p>
        <ul className="mt-4 space-y-2">
          {q.options.map((opt, i) => (
            <li key={i}>
              <button
                className={`flex min-h-12 w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                  answers[index] === i ? "border-accent bg-accent-soft" : "border-border hover:border-accent"
                }`}
                onClick={() => setAnswers((a) => a.map((v, j) => (j === index ? i : v)))}
                aria-pressed={answers[index] === i}
              >
                <span className="font-semibold">{LETTERS[i]})</span>
                <span>{opt}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button className="btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {tm.prev}
        </button>
        {index + 1 < items.length ? (
          <button className="btn-secondary" onClick={() => setIndex(index + 1)}>
            {tm.next}
          </button>
        ) : (
          <button className="btn-primary" onClick={submit}>
            {tm.submit}
          </button>
        )}
      </div>
      {index + 1 < items.length && (
        <button className="btn-primary mt-3 w-full" onClick={submit}>
          {tm.submit}
        </button>
      )}
    </div>
  );
}

function Results({
  items,
  answers,
  timeUp,
  onAgain,
}: {
  items: QuizItem[];
  answers: (number | null)[];
  timeUp: boolean;
  onAgain: () => void;
}) {
  const t = useT();
  const tm = t.mock;
  const score = answers.filter((a, i) => a === items[i].correct_index).length;
  const pct = Math.round((score / items.length) * 100);

  // Aciertos por tema, de peor a mejor.
  const topics = new Map<string, { title: string; right: number; total: number }>();
  items.forEach((q, i) => {
    const tp = topics.get(q.document_id) ?? { title: q.document_title ?? "", right: 0, total: 0 };
    tp.total++;
    if (answers[i] === q.correct_index) tp.right++;
    topics.set(q.document_id, tp);
  });
  const byTopic = [...topics].sort(([, a], [, b]) => a.right / a.total - b.right / b.total);
  const wrong = items.map((q, i) => ({ q, a: answers[i] })).filter(({ q, a }) => a !== q.correct_index);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card flex flex-col items-center gap-2 p-8 text-center">
        {timeUp && <p className="bg-warning-soft rounded-full px-3 py-1 text-sm font-semibold">{tm.timeUp}</p>}
        <span className="text-5xl" aria-hidden="true">
          {pct >= 80 ? "🏆" : pct >= 50 ? "👏" : "💪"}
        </span>
        <p className="text-3xl font-bold">
          {score} / {items.length}
        </p>
        <p className="text-accent text-lg font-semibold">{tm.grade(score, items.length)}</p>
        <p className="text-muted">{t.quiz.result(pct)}</p>
        {wrong.length > 0 && <p className="text-muted text-sm">{tm.savedMistakes}</p>}
        <button className="btn-primary mt-2" onClick={onAgain}>
          {tm.again}
        </button>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">{tm.byTopic}</h2>
        <ul className="space-y-3">
          {byTopic.map(([id, tp]) => {
            const p = Math.round((tp.right / tp.total) * 100);
            return (
              <li key={id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/documento/${id}`} className="hover:text-accent min-w-0 truncate font-medium">
                    {tp.title}
                  </Link>
                  <span className="text-muted shrink-0">
                    {tp.right}/{tp.total}
                  </span>
                </div>
                <div className="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${p >= 80 ? "bg-success" : p >= 50 ? "bg-warning" : "bg-danger"}`}
                    style={{ width: `${Math.max(p, 3)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {wrong.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">{tm.reviewWrong}</h2>
          {wrong.map(({ q, a }, i) => (
            <div key={i} className="card p-5 text-sm">
              <p className="text-accent mb-1 text-xs font-semibold">{q.document_title}</p>
              <p className="font-medium">{q.question}</p>
              <p className="text-danger mt-2">
                {tm.yourAnswer} {a === null ? tm.noAnswer : `${LETTERS[a]}) ${q.options[a]}`}
              </p>
              <p className="text-success">
                {tm.correctAnswer} {LETTERS[q.correct_index]}) {q.options[q.correct_index]}
              </p>
              <p className="bg-surface-2 mt-2 rounded-xl p-3">{q.explanation}</p>
              <Link href={`/documento/${q.document_id}`} className="text-accent mt-2 inline-block font-medium">
                {tm.studyTopic}
              </Link>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function MockContent() {
  const t = useT();
  const tm = t.mock;
  const lang = useLang();
  const subjectId = useSearchParams().get("asignatura") ?? "";
  const [count, setCount] = useState(20);
  const [timed, setTimed] = useState(true);
  const [data, setData] = useState<MockResponse | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"setup" | "exam" | "results">("setup");
  const [result, setResult] = useState<{ answers: (number | null)[]; timeUp: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<MockResponse>(`/quiz/mock?subject_id=${encodeURIComponent(subjectId)}&count=${count}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [subjectId, count]);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (phase === "setup") load();
  }, [load, lang, phase]);

  const finish = useCallback(
    (answers: (number | null)[], timeUp: boolean) => {
      if (!data) return;
      saveAnswers(
        data.items.map((q, i) => ({
          document_id: q.document_id,
          question_index: q.question_index,
          correct: answers[i] === q.correct_index,
        })),
      );
      setResult({ answers, timeUp });
      setPhase("results");
      window.scrollTo({ top: 0 });
    },
    [data],
  );

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner label={t.common.loading} />;

  return (
    <>
      <Link href="/estudiar" className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <PageHeader icon={Exam} title={tm.title} subtitle={tm.subtitle(data.subject_name)} />

      {phase === "exam" ? (
        <MockExam items={data.items} timed={timed} onFinish={finish} />
      ) : phase === "results" && result ? (
        <Results
          items={data.items}
          answers={result.answers}
          timeUp={result.timeUp}
          onAgain={() => {
            setData(null);
            setResult(null);
            setPhase("setup");
          }}
        />
      ) : data.items.length === 0 ? (
        <p className="card text-muted p-5">{tm.empty}</p>
      ) : (
        <div className="card mx-auto max-w-lg space-y-5 p-6">
          <fieldset>
            <legend className="mb-2 font-semibold">{tm.howMany}</legend>
            <div className="flex gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  className={`min-h-11 flex-1 rounded-xl border-2 font-semibold ${
                    count === n ? "border-accent bg-accent-soft text-accent" : "border-border"
                  }`}
                  aria-pressed={count === n}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
            {tm.timed}
          </label>
          <div className="text-muted space-y-1 text-sm">
            <p>{tm.topics(data.topics)}</p>
            {data.missing_topics > 0 && <p>{tm.missing(data.missing_topics)}</p>}
          </div>
          <button className="btn-primary w-full" onClick={() => setPhase("exam")}>
            {tm.start} ({data.items.length})
          </button>
        </div>
      )}
    </>
  );
}

export default function MockPage() {
  // useSearchParams necesita un Suspense alrededor.
  return (
    <Suspense>
      <MockContent />
    </Suspense>
  );
}
