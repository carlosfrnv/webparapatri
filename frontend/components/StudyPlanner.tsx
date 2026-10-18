"use client";

import { Sparkle, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { Exam, ExamsResponse, ScheduleBlock, Subject } from "@/lib/types";
import { localToday } from "./ExamPlan";
import { addDays, blockOnDate } from "./Timetable";
import { Spinner } from "./ui";

/**
 * Propuesta de plan de estudio para la semana del horario: busca huecos libres de una hora entre sus clases
 * y los reparte entre las asignaturas, dando más horas a las que tienen examen o entrega cerca.
 * No gasta IA: son cuentas en el propio navegador. Ella elige qué bloques añadir.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const weekdayOf = (iso: string) => ((new Date(`${iso}T12:00:00`).getDay() + 6) % 7) + 1;

const DURATION = 60;
const MARGIN = 15; // minutos libres antes y después de cada clase
const DAY_START = 9 * 60;
const DAY_END = 21 * 60;
const EXAM_HORIZON = 21; // días: los exámenes más lejanos no cuentan

export interface Proposal {
  key: string;
  date: string;
  start: number;
  subject: Subject;
  exam: Exam | null;
}

export function proposePlan({
  monday,
  blocks,
  subjects,
  exams,
  perDay,
  today,
  nowMin,
}: {
  monday: string;
  blocks: ScheduleBlock[];
  subjects: Subject[];
  exams: Exam[];
  perDay: number;
  today: string;
  nowMin: number;
}): Proposal[] {
  if (subjects.length === 0) return [];
  const upcoming = exams.filter((e) => e.subject_id && e.days_left >= 0 && e.days_left <= EXAM_HORIZON);
  const examOf = (s: Subject, date: string) =>
    upcoming.filter((e) => e.subject_id === s.id && e.exam_date >= date).sort((a, b) => a.days_left - b.days_left)[0] ??
    null;
  // Peso de cada asignatura: más cuanto más cerca está su examen; las demás, un poco.
  const weight = (s: Subject, date: string) => {
    const e = examOf(s, date);
    return e ? EXAM_HORIZON + 2 - e.days_left : upcoming.length ? 0.5 : 1;
  };
  const assigned = new Map<string, number>();
  const out: Proposal[] = [];

  for (let i = 0; i < 6; i++) {
    const date = addDays(monday, i);
    if (date < today) continue;
    const busy = blocks
      .filter((b) => blockOnDate(b, date))
      .map((b) => [toMin(b.start_time) - MARGIN, toMin(b.end_time) + MARGIN] as const);
    const free = (start: number) => !busy.some(([a, b]) => start < b && start + DURATION > a);
    const earliest = date === today ? Math.ceil((nowMin + 30) / 30) * 30 : DAY_START;
    // Entre semana se prefiere la tarde (por la mañana suele haber clase); el sábado, desde las 10.
    const preferred = Math.max(earliest, weekdayOf(date) === 6 ? 10 * 60 : 15 * 60);
    const candidates: number[] = [];
    for (let m = Math.max(earliest, DAY_START); m + DURATION <= DAY_END; m += 30) if (free(m)) candidates.push(m);
    const ordered = [...candidates.filter((m) => m >= preferred), ...candidates.filter((m) => m < preferred)];
    const chosen: number[] = [];
    for (const m of ordered) {
      if (chosen.length >= perDay) break;
      // Media hora de descanso entre dos bloques de estudio.
      if (chosen.every((c) => m >= c + DURATION + 30 || m + DURATION + 30 <= c)) chosen.push(m);
    }
    chosen.sort((a, b) => a - b);
    const usedToday = new Set<string>();
    for (const start of chosen) {
      const pool = subjects.filter((s) => weight(s, date) > 0);
      const score = (s: Subject) => weight(s, date) / ((assigned.get(s.id) ?? 0) + 1) - (usedToday.has(s.id) ? 100 : 0);
      const subject = [...pool].sort((a, b) => score(b) - score(a))[0];
      if (!subject) continue;
      assigned.set(subject.id, (assigned.get(subject.id) ?? 0) + 1);
      usedToday.add(subject.id);
      out.push({ key: `${date}-${start}`, date, start, subject, exam: examOf(subject, date) });
    }
  }
  return out;
}

export function StudyPlanner({
  monday,
  blocks,
  subjects,
  onClose,
  onAdded,
}: {
  monday: string;
  blocks: ScheduleBlock[];
  subjects: Subject[];
  onClose: () => void;
  onAdded: (n: number) => void;
}) {
  const t = useT();
  const tp = t.calendar.schedule.plan;
  const lang = useLang();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [perDay, setPerDay] = useState(2);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [now] = useState(() => {
    const d = new Date();
    return { today: localToday(), min: d.getHours() * 60 + d.getMinutes() };
  });

  useEffect(() => {
    api
      .get<ExamsResponse>(`/exams?today=${localToday()}`)
      .then((r) => setExams(r.exams))
      .catch(() => setExams([]));
  }, []);

  const proposals = useMemo(
    () => (exams ? proposePlan({ monday, blocks, subjects, exams, perDay, today: now.today, nowMin: now.min }) : []),
    [monday, blocks, subjects, exams, perDay, now],
  );
  const selected = proposals.filter((p) => !skipped.has(p.key));

  async function add() {
    setSaving(true);
    setProblem("");
    let n = 0;
    try {
      for (const p of selected) {
        await api.post("/schedule", {
          day: weekdayOf(p.date),
          date: p.date,
          start_time: toTime(p.start),
          end_time: toTime(p.start + DURATION),
          title: tp.blockTitle(p.subject.name).slice(0, 80),
          subject_id: p.subject.id,
          location: null,
          class_type: null,
          teacher: null,
          color: "amber",
        });
        n++;
      }
      onAdded(n);
    } catch (err) {
      setProblem(errorMessage(err));
      if (n > 0) onAdded(n);
    } finally {
      setSaving(false);
    }
  }

  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric" });
  const byDay = [...new Set(proposals.map((p) => p.date))];

  return (
    <div className="card border-accent space-y-4 border-2 p-4 sm:p-5" role="region" aria-label={tp.title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-bold">
            <Sparkle size={18} weight="fill" className="text-accent" aria-hidden="true" /> {tp.title}
          </p>
          <p className="text-muted mt-1 text-sm">{tp.intro}</p>
        </div>
        <button className="btn-ghost px-2" onClick={onClose} aria-label={t.common.close}>
          <X size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{tp.perDay}</span>
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setPerDay(n)}
            aria-pressed={perDay === n}
            className={`min-h-9 rounded-full border-2 px-4 font-semibold ${perDay === n ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {tp.hours(n)}
          </button>
        ))}
      </div>

      {!exams ? (
        <Spinner />
      ) : proposals.length === 0 ? (
        <p className="text-muted text-sm">{subjects.length === 0 ? tp.noSubjects : tp.noSlots}</p>
      ) : (
        <div className="space-y-3">
          {byDay.map((d) => (
            <div key={d}>
              <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">{dayLabel(d)}</p>
              <ul className="space-y-1.5">
                {proposals
                  .filter((p) => p.date === d)
                  .map((p) => {
                    const on = !skipped.has(p.key);
                    return (
                      <li key={p.key}>
                        <label
                          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm ${on ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-border opacity-60"}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setSkipped((s) => {
                                const next = new Set(s);
                                if (next.has(p.key)) next.delete(p.key);
                                else next.add(p.key);
                                return next;
                              })
                            }
                          />
                          <span className="font-semibold tabular-nums">
                            {toTime(p.start)}–{toTime(p.start + DURATION)}
                          </span>
                          <span className="min-w-0 flex-1">
                            {p.subject.name}
                            {p.exam && (
                              <span className="text-muted block text-xs">
                                {tp.examIn(p.exam.title, p.exam.days_left)}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {problem && <p className="text-danger text-sm">{problem}</p>}
      {proposals.length > 0 && (
        <button className="btn-primary w-full sm:w-auto" disabled={saving || selected.length === 0} onClick={add}>
          {saving ? t.common.saving : tp.add(selected.length)}
        </button>
      )}
    </div>
  );
}
