"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { FlashcardSession } from "@/components/FlashcardSession";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { DocumentItem, DueCard, Subject } from "@/lib/types";

function StudyPageContent() {
  const t = useT();
  const router = useRouter();
  const [due, setDue] = useState<{ total_due: number; total_cards: number; cards: DueCard[] } | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [session, setSession] = useState(false);
  const [error, setError] = useState("");
  // Desde el calendario se abre con ?asignatura=<id> para repasar solo esa asignatura.
  const subjectId = useSearchParams().get("asignatura");
  const [subjectName, setSubjectName] = useState("");

  // Al cambiar de idioma se vuelven a pedir los datos (p. ej., los nombres de las asignaturas).
  const lang = useLang();
  const load = useCallback(async () => {
    try {
      const [d, list, subjects] = await Promise.all([
        api.get<{ total_due: number; total_cards: number; cards: DueCard[] }>(
          `/flashcards/due?limit=40${subjectId ? `&subject_id=${encodeURIComponent(subjectId)}` : ""}`,
        ),
        api.get<DocumentItem[]>("/documents"),
        subjectId ? api.get<Subject[]>("/subjects") : Promise.resolve([]),
      ]);
      setDue(d);
      setDocs(list.filter((x) => x.status === "ready" && (!subjectId || x.subject_id === subjectId)));
      setSubjectName(subjects.find((s) => s.id === subjectId)?.name ?? "");
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [subjectId]);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  if (session && due) {
    return (
      <>
        <button className="btn-ghost mb-4 px-0" onClick={() => setSession(false)}>
          {t.studyPage.exit}
        </button>
        <FlashcardSession
          cards={due.cards}
          onFinish={() => {
            setSession(false);
            load();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.studyPage.title} subtitle={t.studyPage.subtitle} />
      {subjectId && subjectName && (
        <p className="bg-accent-soft mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm">
          <span>{t.studyPage.onlySubject(subjectName)}</span>
          <button
            className="text-accent font-medium"
            onClick={() => {
              setDue(null);
              router.replace("/estudiar");
            }}
          >
            {t.studyPage.showAll}
          </button>
        </p>
      )}
      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!due && !error && <Spinner label={t.common.loading} />}

      {due && (
        <div className="space-y-8">
          <section className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t.studyPage.reviewTitle}</h2>
              <p className="text-muted mt-1">
                {due.total_cards === 0
                  ? t.studyPage.noCards
                  : due.total_due === 0
                    ? t.studyPage.nothingDue
                    : t.studyPage.due(due.total_due, due.cards.length)}
              </p>
            </div>
            <button className="btn-primary" disabled={due.cards.length === 0} onClick={() => setSession(true)}>
              {t.studyPage.start}
            </button>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">{t.studyPage.quizzesTitle}</h2>
            <p className="text-muted mb-3">{t.studyPage.quizzesText}</p>
            {docs.length === 0 ? (
              <p className="card text-muted p-4">{t.studyPage.noReady}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/documento/${d.id}#test`}
                      className="card hover:border-accent flex min-h-14 items-center justify-between gap-3 p-4"
                    >
                      <span className="truncate font-medium">{d.title}</span>
                      <span className="text-accent" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function StudyPage() {
  // useSearchParams necesita un Suspense alrededor.
  return (
    <Suspense>
      <StudyPageContent />
    </Suspense>
  );
}
