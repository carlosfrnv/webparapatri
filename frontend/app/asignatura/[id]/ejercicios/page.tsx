"use client";

import { Calculator } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Markdown, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { Subject } from "@/lib/types";

interface Step {
  instruction: string;
  hint: string;
  answer: string;
  explanation: string;
}

interface Exercise {
  topic: string;
  statement: string;
  steps: Step[];
  final_answer: string;
  document_id: string;
  document_title: string;
}

interface Topic {
  document_id: string;
  title: string;
  concepts: string[];
}

type Stats = Record<string, { done: number; wrong: number }>;

// Lo que más falla, por tipo de ejercicio: se guarda en el iPad (no hace falta servidor).
const statsKey = (subjectId: string) => `ejercicios-${subjectId}`;
function readStats(subjectId: string): Stats {
  try {
    return JSON.parse(localStorage.getItem(statsKey(subjectId)) ?? "{}") as Stats;
  } catch {
    return {};
  }
}

const WEAKEST = "__weakest__";

/**
 * Ejercicios guiados de una asignatura de fórmulas: la IA crea un ejercicio parecido a los de sus apuntes y ella
 * lo resuelve paso a paso. Cada paso se corrige (los números sin IA) y, si falla, se le dice qué ha podido fallar.
 */
export default function ExercisesPage() {
  const t = useT();
  const te = t.exercises;
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [docId, setDocId] = useState("");
  const [kind, setKind] = useState("");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<null | { correct: boolean; feedback: string }>(null);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failedThis, setFailedThis] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo guardado en el iPad
    setStats(readStats(id));
    api
      .get<Subject[]>("/subjects")
      .then((list) => setSubject(list.find((s) => s.id === id) ?? null))
      .catch(() => undefined);
    api
      .get<{ topics: Topic[] }>(`/exercises/topics?subject_id=${id}`)
      .then((r) => setTopics(r.topics))
      .catch((err) => setError(errorMessage(err)));
  }, [id, lang]);

  function record(topic: string, wrong: boolean) {
    const next = { ...readStats(id) };
    const cur = next[topic] ?? { done: 0, wrong: 0 };
    next[topic] = { done: cur.done + (wrong ? 0 : 1), wrong: cur.wrong + (wrong ? 1 : 0) };
    try {
      localStorage.setItem(statsKey(id), JSON.stringify(next));
    } catch {
      /* sin almacenamiento: no se guarda */
    }
    setStats(next);
  }

  const weakest = Object.entries(stats)
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => b[1].wrong / (b[1].done + b[1].wrong) - a[1].wrong / (a[1].done + a[1].wrong))[0]?.[0];

  async function newExercise() {
    setLoading(true);
    setError("");
    setExercise(null);
    try {
      const topic = kind === WEAKEST ? weakest : kind || undefined;
      const ex = await api.post<Exercise>("/exercises/new", {
        subject_id: id,
        document_id: docId || undefined,
        topic,
        avoid: recent.slice(-5),
      });
      setExercise(ex);
      setRecent((r) => [...r, ex.statement.slice(0, 160)]);
      setStepIndex(0);
      resetStep();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function resetStep() {
    setAnswer("");
    setResult(null);
    setShowHint(false);
    setRevealed(false);
    setFailedThis(false);
  }

  async function check() {
    if (!exercise || !answer.trim()) return;
    const step = exercise.steps[stepIndex];
    setChecking(true);
    try {
      const r = await api.post<{ correct: boolean; feedback: string }>("/exercises/check", {
        statement: exercise.statement,
        instruction: step.instruction,
        expected: step.answer,
        answer,
      });
      setResult(r);
      if (!r.correct) setFailedThis(true);
      else advance(failedThis);
    } catch (err) {
      setResult({ correct: false, feedback: errorMessage(err) });
    } finally {
      setChecking(false);
    }
  }

  async function why() {
    if (!exercise) return;
    const step = exercise.steps[stepIndex];
    try {
      const r = await api.post<{ feedback: string }>("/exercises/why", {
        statement: exercise.statement,
        instruction: step.instruction,
        expected: step.answer,
        answer,
      });
      setResult({ correct: false, feedback: r.feedback });
    } catch (err) {
      setResult({ correct: false, feedback: errorMessage(err) });
    }
  }

  /** Paso hecho (bien, o viendo la solución): se pasa al siguiente; al terminar se apunta si hubo fallos. */
  function advance(hadError: boolean) {
    if (!exercise) return;
    const last = stepIndex + 1 >= exercise.steps.length;
    if (last) record(exercise.topic, hadError || revealed);
    setTimeout(
      () => {
        setStepIndex((i) => i + 1);
        resetStep();
      },
      last ? 0 : 900,
    );
  }

  function reveal() {
    if (!exercise) return;
    setRevealed(true);
    setFailedThis(true);
  }

  const name = subject?.name ?? "";
  const chosen = topics?.find((x) => x.document_id === docId);
  const kinds = chosen ? chosen.concepts : [...new Set((topics ?? []).flatMap((x) => x.concepts))];
  const done = exercise && stepIndex >= exercise.steps.length;
  const step = exercise && !done ? exercise.steps[stepIndex] : null;

  return (
    <>
      <Link href={`/asignatura/${id}`} className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <PageHeader icon={Calculator} title={te.title} subtitle={te.subtitle(name)} />

      {error && <ErrorBox message={error} />}
      {!topics && !error && <Spinner label={t.common.loading} />}

      {topics && (
        <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-semibold">{te.topic}</span>
            <select
              className="input"
              value={docId}
              onChange={(e) => {
                setDocId(e.target.value);
                setKind("");
              }}
            >
              <option value="">{te.allTopics}</option>
              {topics.map((x) => (
                <option key={x.document_id} value={x.document_id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-semibold">{te.kind}</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{te.anyKind}</option>
              {weakest && <option value={WEAKEST}>⭐ {te.weakest}</option>}
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={newExercise} disabled={loading}>
            {exercise ? te.another : te.start}
          </button>
        </div>
      )}

      {loading && <Spinner label={te.preparing} />}

      {exercise && (
        <article className="card space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-accent-soft text-accent rounded-full px-3 py-1 font-semibold">{exercise.topic}</span>
            <span className="text-muted">
              {te.fromTopic} {exercise.document_title}
            </span>
          </div>
          <Markdown>{exercise.statement}</Markdown>

          {/* Pasos ya hechos */}
          <ol className="space-y-2">
            {exercise.steps.slice(0, stepIndex).map((s, i) => (
              <li key={i} className="bg-success-soft rounded-xl px-3 py-1 text-sm">
                <Markdown>{`**${te.step(i + 1, exercise.steps.length)}:** ${s.instruction}\n\n**${s.answer}** — ${s.explanation}`}</Markdown>
              </li>
            ))}
          </ol>

          {step && (
            <div className="border-accent space-y-3 rounded-xl border-2 p-4">
              <p className="text-accent text-xs font-bold">{te.step(stepIndex + 1, exercise.steps.length)}</p>
              <div className="font-semibold">
                <Markdown>{step.instruction}</Markdown>
              </div>
              {showHint && (
                <div className="bg-warning-soft rounded-lg p-3 text-sm">
                  <Markdown>{step.hint}</Markdown>
                </div>
              )}
              {revealed ? (
                <div className="bg-surface-2 rounded-lg p-3 text-sm">
                  <Markdown>{`**${step.answer}** — ${step.explanation}`}</Markdown>
                  <button className="btn-primary mt-3" onClick={() => advance(true)}>
                    {t.quiz.next}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="input min-w-0 flex-1"
                      value={answer}
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        setResult(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && check()}
                      placeholder={te.answerPlaceholder}
                      inputMode="decimal"
                      aria-label={te.answerPlaceholder}
                    />
                    <button className="btn-primary" onClick={check} disabled={checking || !answer.trim()}>
                      {checking ? te.checking : te.check}
                    </button>
                  </div>
                  {result && (
                    <div className={`rounded-lg p-3 text-sm ${result.correct ? "bg-success-soft" : "bg-danger-soft"}`}>
                      <p className="font-semibold">{result.correct ? te.right : te.wrong}</p>
                      {result.feedback && <p className="mt-1">{result.feedback}</p>}
                      {!result.correct && !result.feedback && (
                        <button className="btn-ghost text-accent mt-1 px-0 text-sm" onClick={why}>
                          {te.why}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!showHint && step.hint && (
                      <button className="btn-ghost text-sm" onClick={() => setShowHint(true)}>
                        {te.hint}
                      </button>
                    )}
                    {(failedThis || showHint) && (
                      <button className="btn-ghost text-sm" onClick={reveal}>
                        {te.solution}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {done && (
            <div className="bg-success-soft space-y-2 rounded-xl p-4">
              <p className="text-lg font-bold">{te.solved}</p>
              <div className="text-sm">
                <strong>{te.finalAnswer}</strong> <Markdown>{exercise.final_answer}</Markdown>
              </div>
              <button className="btn-primary" onClick={newExercise} disabled={loading}>
                {te.another}
              </button>
            </div>
          )}
        </article>
      )}

      {topics && (
        <section className="card mt-4 p-4 text-sm">
          <p className="font-semibold">{te.yourStats}</p>
          {Object.keys(stats).length === 0 ? (
            <p className="text-muted mt-1">{te.noStats}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {Object.entries(stats)
                .sort((a, b) => b[1].wrong - a[1].wrong)
                .slice(0, 6)
                .map(([k, s]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span>{k}</span>
                    <span className="text-muted tabular-nums">{te.statLine(s.done + s.wrong, s.wrong)}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
