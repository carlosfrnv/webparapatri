"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FlashcardSession } from "@/components/FlashcardSession";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { DocumentItem, DueCard } from "@/lib/types";

export default function StudyPage() {
  const t = useT();
  const [due, setDue] = useState<{ total_due: number; total_cards: number; cards: DueCard[] } | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [session, setSession] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, list] = await Promise.all([
        api.get<{ total_due: number; total_cards: number; cards: DueCard[] }>("/flashcards/due?limit=40"),
        api.get<DocumentItem[]>("/documents"),
      ]);
      setDue(d);
      setDocs(list.filter((x) => x.status === "ready"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

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
