"use client";

import { BookOpen, Brain, CircleCheck, Flame, Layers, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExamPlanCard, localToday } from "@/components/ExamPlan";
import { SpecialDay } from "@/components/SpecialDay";
import { ErrorBox, formatDate, Spinner, StatusBadge } from "@/components/ui";
import { useDedicatoria } from "@/config/dedicatoria";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT, type Dictionary } from "@/lib/i18n";
import type { ExamsResponse, Stats } from "@/lib/types";

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
        <p className="text-muted mt-4 whitespace-pre-line">{dedicatoria.mensaje}</p>
        <p className="mt-4 font-medium">{dedicatoria.firma}</p>
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
  const [exams, setExams] = useState<ExamsResponse | null>(null);
  const [error, setError] = useState("");
  // Esta página solo se pinta en el navegador (después del login), así que podemos leer el localStorage.
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return typeof window !== "undefined" && !localStorage.getItem("welcome-seen");
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    try {
      const [s, d, e] = await Promise.all([
        api.get<Stats>("/stats"),
        api.get<{ total_due: number; total_cards: number }>("/flashcards/due?limit=1"),
        // Si falla el calendario, el resto de la página se muestra igual.
        api.get<ExamsResponse>(`/exams?today=${localToday()}`).catch(() => null),
      ]);
      setStats(s);
      setDue(d);
      setExams(e);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const rawDate = new Date().toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long" });
  const todayLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  // El examen más cercano de los que tienen plan (próximas semanas).
  const nextExam = exams?.exams.find((e) => exams.plan.some((p) => p.exam_id === e.id));

  function closeWelcome() {
    setShowWelcome(false);
    try {
      localStorage.setItem("welcome-seen", "1");
    } catch {
      /* se ignora */
    }
  }

  return (
    <>
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}

      <section className="hero hero-glow mb-8 p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/70">{todayLabel}</p>
            <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
              {lang === "es" ? "¡" : ""}
              {greeting(t)}, {dedicatoria.nombre}! 👋
            </h1>
            <p className="mt-2 max-w-xl text-white/80">{dedicatoria.frase}</p>
            {due && due.total_due > 0 && (
              <Link
                href="/estudiar"
                className="btn mt-5 bg-white font-semibold text-[#2a1a6e] shadow-lg shadow-black/20 hover:bg-white/90"
              >
                <Brain size={18} aria-hidden="true" /> {t.home.reviewNow}
              </Link>
            )}
          </div>
          {stats && due && (
            <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[26rem]">
              {[
                { label: t.home.dueCards, value: due.total_due, Icon: Layers },
                { label: t.home.reviewedToday, value: stats.reviewed_today, Icon: CircleCheck },
                { label: t.home.studyDays, value: `${stats.study_days_week}/7`, Icon: Flame },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="rounded-2xl bg-white/12 p-3 ring-1 ring-white/15 backdrop-blur-sm">
                  <Icon size={18} className="text-white/80" aria-hidden="true" />
                  <dd className="font-display mt-2 text-2xl font-extrabold sm:text-3xl">{value}</dd>
                  <dt className="text-[11px] leading-tight text-white/75 sm:text-xs">{label}</dt>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* El 21 de cada mes, el aniversario y el 8 de octubre (después de la bienvenida, si coincide). */}
      <SpecialDay suppressModal={showWelcome} />

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
          {nextExam && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t.calendar.nextExam}</h2>
                <Link href="/calendario" className="text-accent text-sm font-medium">
                  {t.calendar.seeCalendar}
                </Link>
              </div>
              <ExamPlanCard exam={nextExam} plan={exams?.plan.find((p) => p.exam_id === nextExam.id)} maxTasks={3} />
            </section>
          )}
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
            <Link href="/chat" className="card card-hover flex items-center gap-4 p-5">
              <span className="icon-tile bg-accent-soft text-accent">
                <MessageCircle size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">{t.home.askTitle}</p>
                <p className="text-muted text-sm">{t.home.askText}</p>
              </div>
            </Link>
            <Link href="/biblioteca" className="card card-hover flex items-center gap-4 p-5">
              <span className="icon-tile bg-teal-soft text-teal">
                <BookOpen size={22} aria-hidden="true" />
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
