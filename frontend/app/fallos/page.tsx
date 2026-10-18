"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Quiz } from "@/components/Quiz";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { QuizItem, Subject } from "@/lib/types";

const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

function MistakesContent() {
  const t = useT();
  const tm = t.mistakes;
  const lang = useLang();
  const params = useSearchParams();
  const [subjectId, setSubjectId] = useState(params.get("asignatura") ?? "");
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [session, setSession] = useState<QuizItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, subs] = await Promise.all([
        api.get<{ items: QuizItem[] }>("/quiz/mistakes"),
        api.get<Subject[]>("/subjects"),
      ]);
      setItems(m.items);
      setSubjects(subs);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  if (error) return <ErrorBox message={error} />;
  if (!items) return <Spinner label={t.common.loading} />;

  if (session) {
    return (
      <>
        <button className="btn-ghost mb-4 px-0" onClick={() => setSession(null)}>
          {t.studyPage.exit}
        </button>
        <Quiz
          questions={session}
          onDone={() => {
            setSession(null);
            setItems(null);
            load();
          }}
        />
      </>
    );
  }

  // Solo se ofrecen como filtro las asignaturas que tienen fallos.
  const withMistakes = subjects
    .map((s) => ({ ...s, count: items.filter((q) => q.subject_id === s.id).length }))
    .filter((s) => s.count > 0);
  const shown = subjectId ? items.filter((q) => q.subject_id === subjectId) : items;

  return (
    <>
      <Link href="/estudiar" className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <PageHeader icon={ArrowCounterClockwise} title={tm.title} subtitle={tm.subtitle} />

      {items.length === 0 ? (
        <p className="card text-muted p-5">{tm.empty}</p>
      ) : (
        <div className="space-y-5">
          {withMistakes.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {[{ id: "", name: tm.all, count: items.length }, ...withMistakes].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubjectId(s.id)}
                  aria-pressed={subjectId === s.id}
                  className={`min-h-10 rounded-full border-2 px-4 text-sm font-medium ${
                    subjectId === s.id ? "border-accent bg-accent-soft text-accent" : "border-border"
                  }`}
                >
                  {s.name} · {s.count}
                </button>
              ))}
            </div>
          )}

          <section className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
            <p className="flex-1 font-semibold">{tm.count(shown.length)}</p>
            <button className="btn-primary" disabled={shown.length === 0} onClick={() => setSession(shuffle(shown))}>
              {tm.start}
            </button>
          </section>

          <ul className="space-y-2">
            {shown.map((q) => (
              <li key={`${q.document_id}:${q.question_index}`} className="card p-4 text-sm">
                <p className="text-accent text-xs font-semibold">
                  {q.document_title} · {tm.times(q.wrong_count ?? 1)}
                </p>
                <p className="mt-1 font-medium">{q.question}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function MistakesPage() {
  // useSearchParams necesita un Suspense alrededor.
  return (
    <Suspense>
      <MistakesContent />
    </Suspense>
  );
}
