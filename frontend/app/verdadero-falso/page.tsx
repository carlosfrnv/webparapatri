"use client";

import { CheckCircle, Scales, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { Subject } from "@/lib/types";

const COUNTS = [10, 15, 20];

interface Item {
  statement: string;
  answer: boolean;
  explanation: string;
  document_id: string;
  document_title: string;
}

interface Round {
  items: Item[];
  missing_topics: number;
}

/** Una ronda: cada afirmación se responde y se corrige al momento, con la explicación. */
function Play({ items, onEnd }: { items: Item[]; onEnd: (answers: boolean[]) => void }) {
  const t = useT();
  const tf = t.trueFalse;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const feedback = useRef<HTMLDivElement>(null);
  const q = items[index];
  const picked = answers[index];
  const answered = picked !== undefined;
  const ok = answered && picked === q.answer;
  const right = answers.filter((a, i) => a === items[i].answer).length;
  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i] === items[i].answer; i--) streak++;

  const choose = (v: boolean) => !answered && setAnswers((a) => [...a, v]);
  const next = () => (index + 1 < items.length ? setIndex(index + 1) : onEnd(answers));

  // En el móvil la explicación y «Siguiente» quedan debajo: se baja hasta ellos.
  useEffect(() => {
    if (answered) feedback.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [answered]);

  // Con teclado: V / F (o flechas) para responder, Intro para seguir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!answered && (k === "v" || k === "arrowleft")) choose(true);
      else if (!answered && (k === "f" || k === "arrowright")) choose(false);
      else if (answered && k === "enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-muted mb-2 flex items-center justify-between text-sm">
        <span>{tf.of(index + 1, items.length)}</span>
        <span className="font-semibold">{streak >= 3 ? tf.streak(streak) : `✓ ${right}`}</span>
      </div>
      <div className="bg-surface-2 mb-5 h-2 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className="bg-accent h-full rounded-full transition-all"
          style={{ width: `${(answers.length / items.length) * 100}%` }}
        />
      </div>

      <div
        className={`card flex min-h-44 items-center justify-center border-2 p-6 text-center transition-colors ${
          !answered ? "border-transparent" : ok ? "border-success" : "border-danger"
        }`}
      >
        <p className="text-xl leading-snug font-medium">{q.statement}</p>
      </div>

      {!answered ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="bg-success-soft text-success border-success flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 text-lg font-bold active:scale-95"
            onClick={() => choose(true)}
          >
            <CheckCircle size={26} weight="fill" aria-hidden="true" /> {tf.yes}
          </button>
          <button
            className="bg-danger-soft text-danger border-danger flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 text-lg font-bold active:scale-95"
            onClick={() => choose(false)}
          >
            <XCircle size={26} weight="fill" aria-hidden="true" /> {tf.no}
          </button>
        </div>
      ) : (
        <div ref={feedback} className="mt-5 scroll-mb-28 space-y-4" aria-live="polite">
          <div className={`rounded-2xl p-4 ${ok ? "bg-success-soft" : "bg-danger-soft"}`}>
            <p className={`text-lg font-bold ${ok ? "text-success" : "text-danger"}`}>
              {ok ? tf.right : tf.wrong} <span className="text-text text-base font-semibold">{tf.itWas(q.answer)}</span>
            </p>
            {q.explanation && <p className="mt-1">{q.explanation}</p>}
            {q.document_title && (
              <Link href={`/documento/${q.document_id}`} className="text-accent mt-2 inline-block text-sm font-medium">
                {tf.topic} {q.document_title}
              </Link>
            )}
          </div>
          <button className="btn-primary w-full" onClick={next} autoFocus>
            {index + 1 < items.length ? tf.next : tf.finish}
          </button>
        </div>
      )}
    </div>
  );
}

function Results({
  items,
  answers,
  onAgain,
  onRetry,
  onChange,
}: {
  items: Item[];
  answers: boolean[];
  onAgain: () => void;
  onRetry: () => void;
  onChange: () => void;
}) {
  const t = useT();
  const tf = t.trueFalse;
  const wrong = items.filter((q, i) => answers[i] !== q.answer);
  const score = items.length - wrong.length;
  const pct = Math.round((score / items.length) * 100);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="card flex flex-col items-center gap-2 p-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          {pct >= 80 ? "🏆" : pct >= 50 ? "👏" : "💪"}
        </span>
        <p className="text-3xl font-bold">{tf.score(score, items.length)}</p>
        <p className="text-muted">{t.quiz.result(pct)}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {wrong.length > 0 && (
            <button className="btn-primary" onClick={onRetry}>
              {tf.retryWrong} ({wrong.length})
            </button>
          )}
          <button className={wrong.length > 0 ? "btn-secondary" : "btn-primary"} onClick={onAgain}>
            {tf.again}
          </button>
          <button className="btn-ghost" onClick={onChange}>
            {tf.change}
          </button>
        </div>
      </div>
      <section className="space-y-3">
        <h2 className="font-bold">{wrong.length > 0 ? tf.reviewWrong : tf.allRight}</h2>
        {wrong.map((q, i) => (
          <div key={i} className="card p-5 text-sm">
            <p className="font-medium">{q.statement}</p>
            <p className={`mt-2 font-semibold ${q.answer ? "text-success" : "text-danger"}`}>{tf.itWas(q.answer)}</p>
            {q.explanation && <p className="bg-surface-2 mt-2 rounded-xl p-3">{q.explanation}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}

function TrueFalseContent() {
  const t = useT();
  const tf = t.trueFalse;
  const lang = useLang();
  const params = useSearchParams();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [scope, setScope] = useState(params.get("asignatura") ?? "");
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<"setup" | "loading" | "play" | "results">("setup");
  const [round, setRound] = useState<Round | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  // Cada ronda (también al repetir las falladas) empieza de cero.
  const [run, setRun] = useState(0);

  useEffect(() => {
    api
      .get<Subject[]>("/subjects")
      .then(setSubjects)
      .catch(() => {});
  }, [lang]);

  async function start() {
    setError("");
    setEmpty(false);
    setPhase("loading");
    try {
      const r = await api.post<Round>("/truefalse", { ...(scope ? { subject_id: scope } : {}), count });
      setRound(r);
      if (r.items.length === 0) {
        setEmpty(true);
        setPhase("setup");
        return;
      }
      setItems(r.items);
      setRun((n) => n + 1);
      setPhase("play");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("setup");
    }
  }

  return (
    <>
      <Link href="/estudiar" className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <PageHeader icon={Scales} title={tf.title} subtitle={tf.subtitle} />

      {phase === "loading" && <Spinner label={tf.generating} />}

      {phase === "play" && (
        <Play
          key={run}
          items={items}
          onEnd={(a) => {
            setAnswers(a);
            setPhase("results");
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {phase === "results" && (
        <Results
          items={items}
          answers={answers}
          onAgain={start}
          onRetry={() => {
            setItems(items.filter((q, i) => answers[i] !== q.answer));
            setRun((n) => n + 1);
            setPhase("play");
          }}
          onChange={() => setPhase("setup")}
        />
      )}

      {phase === "setup" && (
        <div className="card mx-auto max-w-lg space-y-5 p-6">
          {error && <ErrorBox message={error} onRetry={start} />}
          {empty && <p className="bg-warning-soft rounded-xl p-3 text-sm">{tf.empty}</p>}
          <fieldset>
            <legend className="mb-2 font-semibold">{tf.scope}</legend>
            <div className="flex flex-wrap gap-2">
              {[{ id: "", name: tf.all }, ...subjects].map((s) => (
                <button
                  key={s.id}
                  className={`min-h-10 rounded-full border-2 px-4 text-sm font-semibold ${
                    scope === s.id ? "border-accent bg-accent-soft text-accent" : "border-border"
                  }`}
                  aria-pressed={scope === s.id}
                  onClick={() => setScope(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-semibold">{tf.howMany}</legend>
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
          {round && round.missing_topics > 0 && (
            <p className="text-muted text-sm">{tf.missing(round.missing_topics)}</p>
          )}
          <button className="btn-primary w-full" onClick={start}>
            {tf.start}
          </button>
        </div>
      )}
    </>
  );
}

export default function TrueFalsePage() {
  // useSearchParams necesita un Suspense alrededor.
  return (
    <Suspense>
      <TrueFalseContent />
    </Suspense>
  );
}
