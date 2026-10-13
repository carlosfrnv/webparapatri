"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorBox, formatDate, Spinner, StatusBadge } from "@/components/ui";
import { useDedicatoria } from "@/config/dedicatoria";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT, type Dictionary } from "@/lib/i18n";
import type { Stats } from "@/lib/types";

function greeting(t: Dictionary) {
  const h = new Date().getHours();
  if (h < 6) return t.home.greetingNight;
  if (h < 13) return t.home.greetingMorning;
  if (h < 20) return t.home.greetingAfternoon;
  return t.home.greetingNight;
}

function WelcomeModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dedicatoria = useDedicatoria();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="card max-w-lg p-8 text-center shadow-xl">
        <div className="text-5xl" aria-hidden="true">
          🎁
        </div>
        <h2 id="welcome-title" className="mt-3 text-2xl font-bold">
          {dedicatoria.titulo}
        </h2>
        <p className="text-muted mt-4 whitespace-pre-line">{dedicatoria.mensagem}</p>
        <p className="mt-4 font-medium">{dedicatoria.assinatura}</p>
        <button className="btn-primary mt-6 w-full" onClick={onClose} autoFocus>
          {t.home.start}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const t = useT();
  const lang = useLang();
  const dedicatoria = useDedicatoria();
  const [stats, setStats] = useState<Stats | null>(null);
  const [due, setDue] = useState<{ total_due: number; total_cards: number } | null>(null);
  const [error, setError] = useState("");
  // Esta página só é desenhada no navegador (depois do login), por isso podemos ler o localStorage.
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return typeof window !== "undefined" && !localStorage.getItem("welcome-seen");
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<Stats>("/stats"),
        api.get<{ total_due: number; total_cards: number }>("/flashcards/due?limit=1"),
      ]);
      setStats(s);
      setDue(d);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // O estado só muda depois do pedido (após o await), não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function closeWelcome() {
    setShowWelcome(false);
    try {
      localStorage.setItem("welcome-seen", "1");
    } catch {
      /* ignora */
    }
  }

  return (
    <>
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}

      <section className="mb-8">
        <h1 className="text-3xl font-bold">
          {lang === "es" ? "¡" : ""}
          {greeting(t)}, {dedicatoria.nome}! 👋
        </h1>
        <p className="text-muted mt-1">{dedicatoria.frase}</p>
      </section>

      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!stats && !error && <Spinner label={t.home.loadingProgress} />}

      {stats && due && (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card bg-accent text-accent-contrast flex flex-col justify-between p-5 sm:col-span-2 lg:col-span-1">
              <div>
                <p className="text-sm opacity-90">{t.home.dueCards}</p>
                <p className="mt-1 text-4xl font-bold">{due.total_due}</p>
              </div>
              {due.total_due > 0 ? (
                <Link href="/estudar" className="btn mt-4 bg-white/95 text-[#1859c4] hover:bg-white">
                  {t.home.reviewNow}
                </Link>
              ) : (
                <p className="mt-4 text-sm opacity-90">{due.total_cards > 0 ? t.home.allDone : t.home.noCardsYet}</p>
              )}
            </div>
            <div className="card p-5">
              <p className="text-muted text-sm">{t.home.reviewedToday}</p>
              <p className="mt-1 text-4xl font-bold">{stats.reviewed_today}</p>
            </div>
            <div className="card p-5">
              <p className="text-muted text-sm">{t.home.studyDays}</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-4xl font-bold">{stats.study_days_week}</p>
                <p className="text-muted mb-1">/ 7</p>
              </div>
              <div className="mt-3 flex gap-1" aria-hidden="true">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 flex-1 rounded-full ${i < stats.study_days_week ? "bg-accent" : "bg-surface-2"}`}
                  />
                ))}
              </div>
            </div>
          </section>

          {stats.documents === 0 ? (
            <section className="card flex flex-col items-center gap-3 p-8 text-center">
              <span className="text-4xl" aria-hidden="true">
                📥
              </span>
              <p className="text-lg font-semibold">{t.home.noFilesTitle}</p>
              <p className="text-muted max-w-md">{t.home.noFilesText}</p>
              <Link href="/biblioteca" className="btn-primary">
                {t.home.goLibrary}
              </Link>
            </section>
          ) : (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{t.home.recentFiles}</h2>
                  <Link href="/biblioteca" className="text-accent text-sm font-medium">
                    {t.home.seeAll}
                  </Link>
                </div>
                <ul className="card divide-border divide-y">
                  {stats.recent_documents.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={d.status === "ready" ? `/documento/${d.id}` : "/biblioteca"}
                        className="hover:bg-surface-2 flex min-h-14 items-center justify-between gap-3 px-4 py-2"
                      >
                        <span className="truncate font-medium">{d.title}</span>
                        <StatusBadge status={d.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <h2 className="mb-3 text-lg font-semibold">{t.home.recentQuizzes}</h2>
                {stats.recent_quizzes.length === 0 ? (
                  <p className="card text-muted p-4">{t.home.noQuizzes}</p>
                ) : (
                  <ul className="card divide-border divide-y">
                    {stats.recent_quizzes.map((q, i) => {
                      const pct = Math.round((q.score / q.total) * 100);
                      return (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{q.title}</p>
                            <p className="text-muted text-sm">{formatDate(q.created_at, lang)}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
                              pct >= 50 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                            }`}
                          >
                            {q.score}/{q.total}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <Link href="/chat" className="card hover:border-accent flex items-center gap-4 p-5">
              <span className="text-3xl" aria-hidden="true">
                💬
              </span>
              <div>
                <p className="font-semibold">{t.home.askTitle}</p>
                <p className="text-muted text-sm">{t.home.askText}</p>
              </div>
            </Link>
            <Link href="/biblioteca" className="card hover:border-accent flex items-center gap-4 p-5">
              <span className="text-3xl" aria-hidden="true">
                📚
              </span>
              <div>
                <p className="font-semibold">{t.nav.library}</p>
                <p className="text-muted text-sm">{t.home.libraryText}</p>
              </div>
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
