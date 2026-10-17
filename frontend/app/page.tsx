"use client";

import {
  CalendarBlank,
  CalendarCheck,
  CalendarPlus,
  Cards,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  Clock,
  Exam,
  FileText,
  Fire,
  Heart,
  Target,
  UploadSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExamPlanCard, localToday } from "@/components/ExamPlan";
import { GradientIcon } from "@/components/GradientIcon";
import { HeroArt } from "@/components/HeroArt";
import { SpecialDay } from "@/components/SpecialDay";
import { addDays, BLOCK_STYLE, blockDetails, blockOnDate } from "@/components/Timetable";
import { WeekChart } from "@/components/WeekChart";
import { ErrorBox, formatDate, Spinner, StatusBadge } from "@/components/ui";
import { useDedicatoria } from "@/config/dedicatoria";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT, type Dictionary } from "@/lib/i18n";
import type { ExamsResponse, ScheduleBlock, Stats } from "@/lib/types";

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
  const [schedule, setSchedule] = useState<ScheduleBlock[] | null>(null);
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
      const [s, d, e, sch] = await Promise.all([
        api.get<Stats>("/stats"),
        api.get<{ total_due: number; total_cards: number }>("/flashcards/due?limit=1"),
        // Si falla el calendario, el resto de la página se muestra igual.
        api.get<ExamsResponse>(`/exams?today=${localToday()}`).catch(() => null),
        // Lo de esta semana (para saber si usa el horario) y de ahí se saca lo de hoy.
        api
          .get<ScheduleBlock[]>(`/schedule?from=${addDays(localToday(), -6)}&to=${addDays(localToday(), 6)}`)
          .catch(() => null),
      ]);
      setSchedule(sch);
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

  const week = stats?.week ?? [];
  const todayBlocks = (schedule ?? []).filter((b) => blockOnDate(b, localToday()));
  const kpis = stats &&
    due && [
      { label: t.home.dueCards, value: String(due.total_due), icon: Cards, tone: "violet" as const, href: "/estudiar" },
      { label: t.home.reviewedToday, value: String(stats.reviewed_today), icon: CheckCircle, tone: "teal" as const },
      { label: t.home.streak, value: t.home.streakDays(stats.streak ?? 0), icon: Fire, tone: "amber" as const },
      {
        label: t.home.quizAvg,
        value: stats.quiz_avg == null ? "—" : `${stats.quiz_avg} %`,
        icon: Target,
        tone: "pink" as const,
      },
    ];
  const actions = [
    {
      label: t.home.actUpload,
      text: t.home.actUploadText,
      href: "/biblioteca",
      icon: UploadSimple,
      tone: "blue" as const,
    },
    { label: t.home.actReview, text: t.home.actReviewText, href: "/estudiar", icon: Cards, tone: "violet" as const },
    { label: t.home.actTest, text: t.home.actTestText, href: "/estudiar", icon: Exam, tone: "pink" as const },
    { label: t.home.actAsk, text: t.home.actAskText, href: "/chat", icon: ChatCircleDots, tone: "teal" as const },
  ];

  return (
    <>
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}

      {/* Cabecera con degradado */}
      <section className="hero hero-glow mb-6 px-6 py-7 sm:px-10 sm:py-9">
        <div className="relative z-10 grid items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide text-white/90 ring-1 ring-white/20">
              <CalendarBlank size={14} weight="bold" aria-hidden="true" /> {todayLabel}
            </span>
            <h1 className="mt-4 text-3xl leading-tight font-extrabold sm:text-5xl">
              {lang === "es" ? "¡" : ""}
              {greeting(t)}, {dedicatoria.nombre}!
            </h1>
            <p className="mt-3 max-w-xl text-base text-white/80 sm:text-lg">{dedicatoria.frase}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/estudiar"
                className="btn bg-white px-5 font-semibold text-[#a52a69] shadow-lg shadow-black/10 hover:bg-white/90"
              >
                <Cards size={20} weight="duotone" aria-hidden="true" /> {t.home.reviewNow}
              </Link>
              <Link href="/chat" className="btn px-5 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                <ChatCircleDots size={20} weight="duotone" aria-hidden="true" /> {t.home.actAsk}
              </Link>
            </div>
          </div>
          <HeroArt className="hidden h-52 w-52 drop-shadow-2xl sm:block lg:h-60 lg:w-60" />
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

      {stats && due && kpis && (
        <div className="space-y-6">
          {/* Indicadores */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {kpis.map((k) => {
              const inner = (
                <>
                  <GradientIcon icon={k.icon} tone={k.tone} />
                  <div className="min-w-0">
                    <p className="font-display truncate text-2xl leading-tight font-extrabold sm:text-3xl">{k.value}</p>
                    <p className="text-muted text-xs leading-snug sm:text-sm">{k.label}</p>
                  </div>
                </>
              );
              return k.href ? (
                <Link key={k.label} href={k.href} className="card card-hover flex items-center gap-3 p-4 sm:p-5">
                  {inner}
                </Link>
              ) : (
                <div key={k.label} className="card flex items-center gap-3 p-4 sm:p-5">
                  {inner}
                </div>
              );
            })}
          </section>

          {/* Hoy en su horario */}
          {schedule && schedule.length > 0 && (
            <section className="card p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Clock size={22} weight="duotone" className="text-accent" aria-hidden="true" />
                  {t.calendar.schedule.today}
                </h2>
                <Link href="/calendario#horario" className="text-accent text-sm font-semibold">
                  {t.calendar.schedule.seeSchedule}
                </Link>
              </div>
              {todayBlocks.length === 0 ? (
                <p className="text-muted text-sm">{t.calendar.schedule.nothingToday}</p>
              ) : (
                <ul className="flex gap-3 overflow-x-auto pb-1">
                  {todayBlocks.map((b) => (
                    <li
                      key={b.id}
                      className={`min-w-40 shrink-0 rounded-xl border-l-4 px-3 py-2 ${BLOCK_STYLE[b.color].block}`}
                    >
                      <p className="text-xs font-semibold opacity-80">
                        {b.start_time}–{b.end_time}
                      </p>
                      <p className="truncate font-bold">{b.title}</p>
                      {blockDetails(b) && <p className="truncate text-xs font-medium opacity-90">{blockDetails(b)}</p>}
                      {b.location && <p className="truncate text-xs opacity-80">{b.location}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Actividad + accesos rápidos */}
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="card p-5 sm:p-6 lg:col-span-2">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{t.home.weekTitle}</h2>
                  <p className="text-muted text-sm">{t.home.weekSubtitle}</p>
                </div>
                <span className="bg-accent-soft text-accent rounded-full px-3 py-1 text-xs font-bold">
                  {stats.study_days_week}/7
                </span>
              </div>
              {week.length > 0 && <WeekChart week={week} />}
            </div>
            <div className="card p-5 sm:p-6">
              <h2 className="mb-4 text-lg font-bold">{t.home.quickTitle}</h2>
              <ul className="space-y-2">
                {actions.map((a) => (
                  <li key={a.label}>
                    <Link
                      href={a.href}
                      className="hover:bg-surface-2 group flex items-center gap-3 rounded-xl p-2 transition-colors"
                    >
                      <GradientIcon icon={a.icon} tone={a.tone} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{a.label}</span>
                        <span className="text-muted block text-xs">{a.text}</span>
                      </span>
                      <CaretRight
                        size={16}
                        className="text-muted transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Próximo examen */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CalendarCheck size={22} weight="duotone" className="text-accent" aria-hidden="true" />
                {t.calendar.nextExam.replace(/^\S+\s/, "")}
              </h2>
              <Link href="/calendario" className="text-accent text-sm font-semibold">
                {t.calendar.seeCalendar}
              </Link>
            </div>
            {nextExam ? (
              <ExamPlanCard exam={nextExam} plan={exams?.plan.find((p) => p.exam_id === nextExam.id)} maxTasks={3} />
            ) : (
              <Link href="/calendario" className="card card-hover flex items-center gap-4 p-5">
                <GradientIcon icon={CalendarPlus} tone="slate" />
                <div>
                  <p className="font-semibold">{t.home.noExamTitle}</p>
                  <p className="text-muted text-sm">{t.home.noExamText}</p>
                </div>
              </Link>
            )}
          </section>

          {stats.documents === 0 ? (
            <section className="card flex flex-col items-center gap-3 p-8 text-center">
              <GradientIcon icon={UploadSimple} tone="blue" size={56} />
              <p className="text-lg font-bold">{t.home.noFilesTitle}</p>
              <p className="text-muted max-w-md">{t.home.noFilesText}</p>
              <Link href="/biblioteca" className="btn-primary">
                {t.home.goLibrary}
              </Link>
            </section>
          ) : (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="card min-w-0 p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold">{t.home.recentFiles}</h2>
                  <Link href="/biblioteca" className="text-accent text-sm font-semibold">
                    {t.home.seeAll}
                  </Link>
                </div>
                <ul className="divide-border divide-y">
                  {stats.recent_documents.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={d.status === "ready" ? `/documento/${d.id}` : "/biblioteca"}
                        className="hover:bg-surface-2 -mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2"
                      >
                        <span className="icon-tile bg-accent-soft text-accent h-10 w-10">
                          <FileText size={22} weight="duotone" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                        <StatusBadge status={d.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card min-w-0 p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-bold">{t.home.recentQuizzes}</h2>
                {stats.recent_quizzes.length === 0 ? (
                  <p className="text-muted">{t.home.noQuizzes}</p>
                ) : (
                  <ul className="divide-border divide-y">
                    {stats.recent_quizzes.map((q, i) => {
                      const pct = Math.round((q.score / q.total) * 100);
                      return (
                        <li key={i} className="flex items-center gap-3 py-3">
                          <span className="icon-tile bg-pink-soft text-pink h-10 w-10">
                            <Exam size={22} weight="duotone" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{q.title}</p>
                            <p className="text-muted text-sm">{formatDate(q.created_at, lang)}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
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

          {/* Nota personal */}
          <section className="card relative overflow-hidden p-6 sm:p-7">
            <span
              className="absolute -top-10 -right-10 h-36 w-36 rounded-full opacity-20 blur-2xl"
              style={{ background: "var(--hero)" }}
              aria-hidden="true"
            />
            <div className="relative flex items-start gap-4">
              <GradientIcon icon={Heart} tone="slate" />
              <div>
                <p className="text-muted text-xs font-semibold tracking-wider uppercase">{t.home.fromCarlos}</p>
                <p className="font-display mt-1 text-lg font-bold">{dedicatoria.frase}</p>
                <p className="text-muted mt-1 text-sm">{dedicatoria.firma}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
