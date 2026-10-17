"use client";

import { BookOpenText, Cards, Exam as ExamIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { GradientIcon, type Tone } from "./GradientIcon";
import { useDedicatoria } from "@/config/dedicatoria";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { Exam, ExamPlan, PlanTask } from "@/lib/types";

/** Fecha de hoy en el navegador, en formato AAAA-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return toIsoDate(d);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "lunes, 3 de noviembre" a partir de AAAA-MM-DD (sin problemas de zona horaria). */
export function formatExamDate(iso: string, lang: "es" | "pt", withWeekday = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(lang), {
    ...(withWeekday ? { weekday: "long" } : {}),
    day: "numeric",
    month: "long",
  });
}

/**
 * Lo que se muestra de una fecha: primero la asignatura y debajo el nombre del examen o trabajo
 * (si es distinto del de la asignatura) y la fecha.
 */
export function examLabels(exam: Exam, lang: "es" | "pt") {
  const main = exam.subject_name ?? exam.title;
  const sameName = exam.subject_name && exam.title.trim() === exam.subject_name.trim();
  const sub = [exam.subject_name && !sameName ? exam.title : null, formatExamDate(exam.exam_date, lang)]
    .filter(Boolean)
    .join(" · ");
  return { main, sub };
}

export function CountdownBadge({ days, kind = "exam" }: { days: number; kind?: Exam["kind"] }) {
  const t = useT();
  const tone =
    days <= 1 ? "bg-danger-soft text-danger" : days <= 7 ? "bg-warning-soft text-text" : "bg-accent-soft text-accent";
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>
      {days < 0
        ? t.calendar.daysAgo(-days)
        : kind === "assignment"
          ? t.calendar.deliverIn(days)
          : t.calendar.daysLeft(days)}
    </span>
  );
}

function taskLink(task: PlanTask): { href: string; icon: Icon; tone: Tone } {
  if (task.type === "flashcards")
    return { href: `/estudiar?asignatura=${task.subject_id}`, icon: Cards, tone: "violet" };
  if (task.type === "prepare") return { href: `/documento/${task.document_id}`, icon: BookOpenText, tone: "teal" };
  return { href: `/documento/${task.document_id}#test`, icon: ExamIcon, tone: "pink" };
}

/** Lo que toca hoy para un examen: cuenta atrás, progreso y tareas. */
export function ExamPlanCard({ exam, plan, maxTasks }: { exam: Exam; plan?: ExamPlan; maxTasks?: number }) {
  const t = useT();
  const lang = useLang();
  const dedicatoria = useDedicatoria();
  const tasks = plan?.tasks.slice(0, maxTasks) ?? [];

  let note: string | null = null;
  if (exam.days_left === 0) note = null;
  else if (!exam.subject_id) note = t.calendar.noSubjectPlan;
  else if (plan && plan.total_docs === 0) note = t.calendar.noDocs;
  else if (plan && plan.tasks.length === 0) note = t.calendar.allMastered;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{examLabels(exam, lang).main}</p>
          <p className="text-muted text-sm">{examLabels(exam, lang).sub}</p>
        </div>
        <CountdownBadge days={exam.days_left} />
      </div>

      {exam.days_left <= 1 && (
        <p className="bg-accent-soft mt-4 rounded-xl p-3 text-sm font-medium">
          {exam.days_left === 0 ? dedicatoria.examenHoy : dedicatoria.examenManana}
        </p>
      )}
      {exam.days_left === 1 && tasks.length > 0 && <p className="text-muted mt-3 text-sm">{t.calendar.dayBefore}</p>}

      {plan && plan.total_docs > 0 && exam.days_left > 0 && (
        <div className="mt-4">
          <p className="text-muted text-xs">{t.calendar.progress(plan.mastered_docs, plan.total_docs)}</p>
          <div className="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full" aria-hidden="true">
            <div
              className="bg-success h-full rounded-full"
              style={{ width: `${Math.round((plan.mastered_docs / plan.total_docs) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <ul className="mt-4 space-y-2">
          {tasks.map((task, i) => {
            const { href, icon, tone } = taskLink(task);
            const label =
              task.type === "flashcards"
                ? t.calendar.taskFlashcards(task.count)
                : task.type === "prepare"
                  ? t.calendar.taskPrepare(task.title)
                  : t.calendar.taskTest(task.title, task.last_pct);
            return (
              <li key={i}>
                <Link
                  href={href}
                  className="border-border hover:border-accent hover:bg-surface-2 flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 transition-colors"
                >
                  <GradientIcon icon={icon} tone={tone} size={34} />
                  <span className="min-w-0 flex-1 text-sm">{label}</span>
                  <span className="text-accent" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="text-muted mt-4 text-sm">{note}</p>}
    </div>
  );
}
