"use client";

import { Microphone, SpeakerHigh } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { dictate, recognitionClass, speak, unlockSpeech } from "@/lib/speech";

const COUNTS = [3, 5, 10];

interface OralItem {
  document_id: string;
  document_title: string;
  concept: string;
  explanation: string;
}

interface Grade {
  score: number;
  good: string;
  missing: string;
  model_answer: string;
}

/**
 * Examen oral: se lee la pregunta en voz alta, ella responde hablando (o escribiendo)
 * y la IA corrige su respuesta comparándola con sus apuntes.
 */
function Oral() {
  const t = useT();
  const to = t.oral;
  const lang = useLang();
  const params = useSearchParams();
  const subjectId = params.get("asignatura");
  const documentId = params.get("documento");
  const [count, setCount] = useState(5);
  const [data, setData] = useState<{ subject_name: string; items: OralItem[]; missing_topics: number } | null>(null);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState("");
  const [grading, setGrading] = useState(false);
  const [grades, setGrades] = useState<(Grade | null)[]>([]);
  const [finished, setFinished] = useState(false);
  const mic = useRef<{ finish: () => void; cancel: () => void } | null>(null);
  const stopVoice = useRef<(() => void) | null>(null);
  const canListen = typeof window !== "undefined" && !!recognitionClass();

  const query = subjectId ? `subject_id=${subjectId}` : `document_id=${documentId}`;

  useEffect(() => {
    api
      .get<{ subject_name: string; items: OralItem[]; missing_topics: number }>(
        `/oral/questions?${query}&count=${count}`,
      )
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [query, count, lang]);

  // Al salir se corta el micrófono y la voz.
  useEffect(
    () => () => {
      mic.current?.cancel();
      stopVoice.current?.();
    },
    [],
  );

  if (!subjectId && !documentId) return <ErrorBox message={t.common.genericError} />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner label={t.common.loading} />;

  const items = data.items;
  const q = items[index];
  const grade = grades[index];

  function say(text: string) {
    stopVoice.current?.();
    stopVoice.current = speak(text, lang, () => (stopVoice.current = null));
  }

  function ask(i: number) {
    say(to.say(items[i].concept));
  }

  function begin() {
    unlockSpeech();
    setStarted(true);
    setGrades(items.map(() => null));
    ask(0);
  }

  function startListening() {
    stopVoice.current?.();
    setProblem("");
    setListening(true);
    mic.current = dictate({
      lang,
      base: answer,
      silenceMs: 5000,
      onText: setAnswer,
      onEnd: (text, err) => {
        mic.current = null;
        setListening(false);
        setAnswer(text);
        if (err) setProblem(err === "permission" ? to.noPermission : to.notHeard);
      },
    });
  }

  async function correct(skip = false) {
    mic.current?.cancel();
    mic.current = null;
    setListening(false);
    stopVoice.current?.();
    setGrading(true);
    setProblem("");
    try {
      const g = await api.post<Grade>("/oral/grade", {
        concept: q.concept,
        expected: q.explanation,
        answer: skip ? "" : answer,
      });
      setGrades((list) => list.map((x, i) => (i === index ? g : x)));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setGrading(false);
    }
  }

  function next() {
    stopVoice.current?.();
    setAnswer("");
    setProblem("");
    if (index + 1 < items.length) {
      setIndex(index + 1);
      ask(index + 1);
    } else setFinished(true);
  }

  function restart() {
    setStarted(false);
    setFinished(false);
    setIndex(0);
    setAnswer("");
    setGrades([]);
    setData(null);
    api
      .get<{ subject_name: string; items: OralItem[]; missing_topics: number }>(
        `/oral/questions?${query}&count=${count}`,
      )
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }

  const header = (
    <PageHeader
      icon={Microphone}
      title={to.title}
      subtitle={to.subtitle(data.subject_name || q?.document_title || "")}
    />
  );

  if (!started)
    return (
      <>
        {header}
        {items.length === 0 ? (
          <div className="card p-5 text-sm">{to.empty}</div>
        ) : (
          <div className="card space-y-4 p-5">
            <p className="font-semibold">{to.howMany}</p>
            <div className="flex flex-wrap gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  aria-pressed={count === n}
                  className={`min-h-10 rounded-full border-2 px-5 text-sm font-semibold ${count === n ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            {data.missing_topics > 0 && <p className="text-muted text-xs">{to.missing(data.missing_topics)}</p>}
            {!canListen && <p className="text-muted text-xs">{to.noMic}</p>}
            <button className="btn-primary" onClick={begin}>
              {to.start}
            </button>
          </div>
        )}
      </>
    );

  if (finished) {
    const scores = grades.filter((g): g is Grade => !!g).map((g) => g.score);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return (
      <>
        {header}
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-5xl" aria-hidden="true">
            {avg >= 8 ? "🏆" : avg >= 5 ? "👏" : "💪"}
          </span>
          <p className="text-2xl font-bold">{to.average(avg)}</p>
        </div>
        <ul className="card divide-border mt-4 divide-y">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{it.concept}</span>
                <Link href={`/documento/${it.document_id}`} className="text-muted hover:text-accent block text-xs">
                  {to.from} {it.document_title}
                </Link>
              </span>
              <span
                className={`font-bold tabular-nums ${(grades[i]?.score ?? 0) >= 5 ? "text-success" : "text-danger"}`}
              >
                {to.score(grades[i]?.score ?? 0)}
              </span>
            </li>
          ))}
        </ul>
        <button className="btn-primary mt-4" onClick={restart}>
          {to.again}
        </button>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mx-auto max-w-2xl">
        <p className="text-muted mb-3 text-sm">{to.questionOf(index + 1, items.length)}</p>
        <div className="card space-y-4 p-5">
          <div>
            <p className="text-accent text-xs font-semibold">{q.document_title}</p>
            <p className="mt-1 text-xl font-bold">{to.ask(q.concept)}</p>
            <button className="btn-ghost text-accent mt-1 px-0 text-sm" onClick={() => ask(index)}>
              {to.repeat}
            </button>
          </div>

          {!grade && (
            <>
              <textarea
                className="input min-h-32 w-full"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={to.placeholder}
                readOnly={listening}
                aria-label={to.placeholder}
              />
              {listening ? (
                <div className="flex flex-wrap items-center gap-3" role="status">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
                  <p className="text-muted flex-1 text-sm">{to.listening}</p>
                  <button className="btn-secondary" onClick={() => mic.current?.finish()}>
                    {to.stop}
                  </button>
                </div>
              ) : grading ? (
                <Spinner label={to.grading} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canListen && (
                    <button className={answer ? "btn-secondary" : "btn-primary"} onClick={startListening}>
                      {answer ? to.more : to.answer}
                    </button>
                  )}
                  {answer.trim() && (
                    <button className="btn-primary" onClick={() => correct()}>
                      {to.grade}
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => correct(true)}>
                    {to.skip}
                  </button>
                </div>
              )}
            </>
          )}

          {grade && (
            <div className="space-y-3">
              <p className={`text-3xl font-extrabold ${grade.score >= 5 ? "text-success" : "text-danger"}`}>
                {to.score(grade.score)}
              </p>
              {answer && <p className="text-muted text-sm italic">«{answer}»</p>}
              {grade.good && (
                <div className="bg-success-soft rounded-xl p-3 text-sm">
                  <p className="font-semibold">{to.good}</p>
                  <p className="mt-1">{grade.good}</p>
                </div>
              )}
              {grade.missing && (
                <div className="bg-warning-soft rounded-xl p-3 text-sm">
                  <p className="font-semibold">{to.missingPart}</p>
                  <p className="mt-1">{grade.missing}</p>
                </div>
              )}
              <div className="bg-surface-2 rounded-xl p-3 text-sm">
                <p className="font-semibold">{to.model}</p>
                <p className="mt-1">{grade.model_answer}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => say([grade.good, grade.missing, grade.model_answer].filter(Boolean).join(" "))}
                >
                  <SpeakerHigh size={18} weight="duotone" aria-hidden="true" /> {to.listen}
                </button>
                <button className="btn-primary" onClick={next}>
                  {index + 1 < items.length ? to.next : to.finish}
                </button>
              </div>
            </div>
          )}
          {problem && <p className="text-danger text-sm">{problem}</p>}
        </div>
      </div>
    </>
  );
}

export default function OralPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Oral />
    </Suspense>
  );
}
