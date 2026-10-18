"use client";

import { Pause, Play, SkipForward, Stop, Timer } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { subjectLook } from "@/components/subjectLook";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import { formatClock, formatMinutes, sessionSummaryUrl, type SessionSummary, usePomodoro } from "@/lib/pomodoro";
import type { Subject } from "@/lib/types";

const LENGTHS = [25, 45, 50];

/** Reloj circular con lo que queda de la fase. */
function Ring({ fraction, children }: { fraction: number; children: React.ReactNode }) {
  const r = 120;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
      <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="140" cy="140" r={r} fill="none" strokeWidth="14" className="stroke-[var(--surface-2)]" />
        <circle
          cx="140"
          cy="140"
          r={r}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          className="stroke-[var(--accent)] transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export default function PomodoroPage() {
  const t = useT();
  const tp = t.pomodoro;
  const lang = useLang();
  const { state, left, running, start, pause, resume, stop, skipBreak, saved } = usePomodoro();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [focusMin, setFocusMin] = useState(25);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    api
      .get<Subject[]>("/subjects")
      .then(setSubjects)
      .catch(() => undefined);
  }, [lang]);

  useEffect(() => {
    api
      .get<SessionSummary>(sessionSummaryUrl())
      .then(setSummary)
      .catch(() => undefined);
  }, [saved, lang]);

  const idle = state.phase === "idle";
  const total = (state.phase === "break" ? state.breakMin : idle ? focusMin : state.focusMin) * 60;
  const shownLeft = idle ? focusMin * 60 : left;
  const current = subjects.find((s) => s.id === (idle ? subjectId : state.subjectId));
  const maxDay = Math.max(1, ...(summary?.week.map((d) => d.minutes) ?? []));
  const maxSubject = Math.max(1, ...(summary?.by_subject.map((s) => s.minutes) ?? []));

  return (
    <>
      <PageHeader icon={Timer} title={tp.title} subtitle={tp.subtitle} />

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-3">
          <Ring fraction={idle ? 1 : shownLeft / total}>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                state.phase === "break" ? "bg-success-soft text-success" : "bg-accent-soft text-accent"
              }`}
            >
              {idle ? tp.ready : !running ? tp.paused : state.phase === "focus" ? tp.focus : tp.break}
            </span>
            <span className="font-display mt-2 text-6xl font-extrabold tabular-nums" role="timer">
              {formatClock(shownLeft)}
            </span>
            {current && <span className="text-muted mt-1 max-w-[12rem] truncate text-sm">{current.name}</span>}
          </Ring>

          {!idle && <p className="text-muted mt-4 text-center text-sm">{tp.round((state.done % 4) + 1)}</p>}

          {idle ? (
            <div className="mx-auto mt-6 max-w-md space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{tp.subject}</span>
                <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">{tp.noSubject}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">{tp.length}</legend>
                <div className="flex gap-2">
                  {LENGTHS.map((n) => (
                    <button
                      key={n}
                      className={`min-h-11 flex-1 rounded-xl border-2 font-semibold ${
                        focusMin === n ? "border-accent bg-accent-soft text-accent" : "border-border"
                      }`}
                      aria-pressed={focusMin === n}
                      onClick={() => setFocusMin(n)}
                    >
                      {n} min
                    </button>
                  ))}
                </div>
              </fieldset>
              <button className="btn-primary w-full" onClick={() => start({ focusMin, subjectId: subjectId || null })}>
                {tp.start}
              </button>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {running ? (
                <button className="btn-secondary" onClick={pause}>
                  <Pause size={18} weight="fill" aria-hidden="true" /> {tp.pause}
                </button>
              ) : (
                <button className="btn-primary" onClick={resume}>
                  <Play size={18} weight="fill" aria-hidden="true" /> {tp.resume}
                </button>
              )}
              {state.phase === "break" ? (
                <button className="btn-ghost" onClick={skipBreak}>
                  <SkipForward size={18} weight="fill" aria-hidden="true" /> {tp.skipBreak}
                </button>
              ) : (
                <button className="btn-ghost" onClick={stop} title={tp.stopHint}>
                  <Stop size={18} weight="fill" aria-hidden="true" /> {tp.stop}
                </button>
              )}
            </div>
          )}
          {state.phase === "focus" && <p className="text-muted mt-3 text-center text-xs">{tp.stopHint}</p>}
        </section>

        <section className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-bold">{tp.today}</h2>
              <span className="font-display text-accent text-2xl font-extrabold">
                {formatMinutes(summary?.today_minutes ?? 0)}
              </span>
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <h2 className="font-bold">{tp.week}</h2>
              <span className="font-semibold">{formatMinutes(summary?.week_minutes ?? 0)}</span>
            </div>
            {summary && (
              <div className="mt-3 flex h-24 items-end gap-2" aria-hidden="true">
                {summary.week.map((d) => (
                  <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="bg-accent w-full rounded-t-md"
                      style={{
                        height: `${d.minutes ? Math.max(6, (d.minutes / maxDay) * 100) : 3}%`,
                        opacity: d.minutes ? 1 : 0.25,
                      }}
                      title={formatMinutes(d.minutes)}
                    />
                    <span className="text-muted text-[10px]">
                      {new Date(`${d.date}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "narrow" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-bold">{tp.bySubject}</h2>
            {!summary || summary.by_subject.length === 0 ? (
              <p className="text-muted text-sm">{tp.nothing}</p>
            ) : (
              <ul className="space-y-3">
                {summary.by_subject.map((s) => {
                  const subject = subjects.find((x) => x.id === s.subject_id);
                  const look = subject ? subjectLook(subject) : null;
                  return (
                    <li key={s.subject_id ?? "none"}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium">{s.name ?? tp.noSubject}</span>
                        <span className="text-muted shrink-0">{formatMinutes(s.minutes)}</span>
                      </div>
                      <div className="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${look?.bar ?? "bg-accent"}`}
                          style={{ width: `${Math.max(4, (s.minutes / maxSubject) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
