"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CountdownBadge, ExamPlanCard, formatExamDate, localToday, toIsoDate } from "@/components/ExamPlan";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { Exam, ExamsResponse, Subject } from "@/lib/types";

interface ExamInput {
  subject_id: string | null;
  title: string;
  exam_date: string;
  notes: string | null;
}

function ExamForm({
  initial,
  subjects,
  onSubmit,
  onCancel,
}: {
  initial: Partial<ExamInput> & { id?: string };
  subjects: Subject[];
  onSubmit: (data: ExamInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [subjectId, setSubjectId] = useState(initial.subject_id ?? "");
  const [title, setTitle] = useState(initial.title ?? "");
  const [date, setDate] = useState(initial.exam_date ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? "";
          await onSubmit({
            subject_id: subjectId || null,
            title: title.trim() || subjectName,
            exam_date: date,
            notes: notes.trim() || null,
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="font-semibold">{initial.id ? t.calendar.editTitle : t.calendar.addTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-sm font-medium">{t.calendar.subject}</span>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} autoFocus>
            <option value="">{t.calendar.noSubject}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.year ? `${t.docList.yearShort(s.year)} · ` : ""}
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-sm font-medium">{t.calendar.date}</span>
          <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t.calendar.name}</span>
        <input
          className="input"
          maxLength={120}
          required={!subjectId}
          placeholder={subjects.find((s) => s.id === subjectId)?.name ?? t.calendar.namePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t.calendar.notes}</span>
        <textarea
          className="input min-h-20"
          maxLength={500}
          placeholder={t.calendar.notesPlaceholder}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button className="btn-primary" disabled={saving}>
          {saving ? t.common.saving : t.common.save}
        </button>
      </div>
    </form>
  );
}

/** Calendario mensual (empieza en lunes) con los exámenes marcados. */
function MonthGrid({
  month,
  exams,
  today,
  onMonth,
  onPickDay,
}: {
  month: Date;
  exams: Exam[];
  today: string;
  onMonth: (d: Date) => void;
  onPickDay: (iso: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const locale = dateLocale(lang);
  const year = month.getFullYear();
  const m = month.getMonth();
  const offset = (new Date(year, m, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const byDay = new Map<string, Exam[]>();
  for (const e of exams) byDay.set(e.exam_date, [...(byDay.get(e.exam_date) ?? []), e]);
  // 2024-01-01 fue lunes: sirve para sacar los nombres de los días en el idioma elegido.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }).replace(".", ""),
  );
  const monthName = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          className="btn-ghost px-3"
          onClick={() => onMonth(new Date(year, m - 1, 1))}
          aria-label={t.calendar.prevMonth}
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{title}</h2>
          <button className="text-accent text-sm font-medium" onClick={() => onMonth(new Date())}>
            {t.calendar.goToday}
          </button>
        </div>
        <button
          className="btn-ghost px-3"
          onClick={() => onMonth(new Date(year, m + 1, 1))}
          aria-label={t.calendar.nextMonth}
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w) => (
          <div key={w} className="text-muted py-1 text-xs font-medium capitalize">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const iso = toIsoDate(new Date(year, m, day));
          const dayExams = byDay.get(iso) ?? [];
          const isToday = iso === today;
          return (
            <button
              key={i}
              onClick={() => onPickDay(iso)}
              aria-label={
                dayExams.length
                  ? `${formatExamDate(iso, lang)}: ${dayExams.map((e) => e.title).join(", ")}`
                  : t.calendar.addOnDay(formatExamDate(iso, lang, false))
              }
              className={`flex min-h-12 min-w-0 flex-col items-center rounded-lg p-1 text-sm sm:min-h-16 ${
                dayExams.length ? "bg-accent-soft" : "hover:bg-surface-2"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  isToday ? "bg-accent text-accent-contrast font-bold" : ""
                }`}
              >
                {day}
              </span>
              {dayExams.length > 0 && (
                <>
                  <span className="bg-accent mt-0.5 h-1.5 w-1.5 rounded-full sm:hidden" aria-hidden="true" />
                  <span className="text-accent hidden w-full truncate text-[11px] leading-tight font-medium sm:block">
                    {dayExams[0].title}
                    {dayExams.length > 1 ? ` +${dayExams.length - 1}` : ""}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExamRow({ exam, onEdit, onDelete }: { exam: Exam; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <li className="flex items-start gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{exam.title}</p>
        <p className="text-muted text-sm">
          {[exam.subject_name, formatExamDate(exam.exam_date, lang)].filter(Boolean).join(" · ")}
        </p>
        {exam.notes && <p className="text-muted mt-1 text-sm whitespace-pre-line">{exam.notes}</p>}
        <div className="mt-2">
          <CountdownBadge days={exam.days_left} />
        </div>
      </div>
      <button className="btn-ghost px-2" aria-label={`${t.common.edit} ${exam.title}`} onClick={onEdit}>
        ✏️
      </button>
      <button className="btn-ghost px-2" aria-label={`${t.common.delete} ${exam.title}`} onClick={onDelete}>
        🗑️
      </button>
    </li>
  );
}

export default function CalendarPage() {
  const t = useT();
  const [data, setData] = useState<ExamsResponse | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<(Partial<ExamInput> & { id?: string }) | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        api.get<ExamsResponse>(`/exams?today=${localToday()}`),
        api.get<Subject[]>("/subjects"),
      ]);
      setData(d);
      setSubjects(s);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const upcoming = useMemo(() => data?.exams.filter((e) => e.days_left >= 0) ?? [], [data]);
  const past = useMemo(() => (data?.exams.filter((e) => e.days_left < 0) ?? []).reverse(), [data]);
  const plans = useMemo(() => new Map((data?.plan ?? []).map((p) => [p.exam_id, p])), [data]);

  async function save(input: ExamInput) {
    try {
      if (form?.id) await api.patch(`/exams/${form.id}`, input);
      else await api.post("/exams", input);
      setForm(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(exam: Exam) {
    if (!confirm(t.calendar.confirmDelete(exam.title))) return;
    try {
      await api.del(`/exams/${exam.id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openForm(initial: Partial<ExamInput> & { id?: string }) {
    setForm(initial);
    // Lleva el formulario a la vista (en el móvil queda debajo del calendario).
    requestAnimationFrame(() =>
      document.getElementById("exam-form")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        subtitle={t.calendar.subtitle}
        actions={
          <button className="btn-primary" onClick={() => openForm({ exam_date: localToday() })}>
            {t.calendar.add}
          </button>
        }
      />
      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!data && !error && <Spinner label={t.common.loading} />}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">{t.calendar.todayTitle}</h2>
            {data.plan.length === 0 ? (
              <p className="card text-muted p-4">{upcoming.length === 0 ? t.calendar.empty : t.calendar.noPlan}</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {upcoming
                  .filter((e) => plans.has(e.id))
                  .map((e) => (
                    <ExamPlanCard key={e.id} exam={e} plan={plans.get(e.id)} />
                  ))}
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <MonthGrid
                month={month}
                exams={data.exams}
                today={data.today}
                onMonth={setMonth}
                onPickDay={(iso) => openForm({ exam_date: iso })}
              />
              {form && (
                <div id="exam-form">
                  <ExamForm
                    key={form.id ?? form.exam_date}
                    initial={form}
                    subjects={subjects}
                    onSubmit={save}
                    onCancel={() => setForm(null)}
                  />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="mb-3 text-lg font-semibold">{t.calendar.upcoming}</h2>
              {upcoming.length === 0 ? (
                <p className="card text-muted p-4">{t.calendar.empty}</p>
              ) : (
                <ul className="card divide-border divide-y">
                  {upcoming.map((e) => (
                    <ExamRow
                      key={e.id}
                      exam={e}
                      onEdit={() =>
                        openForm({
                          id: e.id,
                          subject_id: e.subject_id,
                          title: e.title,
                          exam_date: e.exam_date,
                          notes: e.notes,
                        })
                      }
                      onDelete={() => remove(e)}
                    />
                  ))}
                </ul>
              )}

              {past.length > 0 && (
                <div className="mt-6">
                  <button
                    className="btn-ghost px-0 font-semibold"
                    onClick={() => setShowPast((v) => !v)}
                    aria-expanded={showPast}
                  >
                    {showPast ? "▾" : "▸"} {t.calendar.past} ({past.length})
                  </button>
                  {showPast && (
                    <ul className="card divide-border mt-2 divide-y opacity-80">
                      {past.map((e) => (
                        <ExamRow
                          key={e.id}
                          exam={e}
                          onEdit={() =>
                            openForm({
                              id: e.id,
                              subject_id: e.subject_id,
                              title: e.title,
                              exam_date: e.exam_date,
                              notes: e.notes,
                            })
                          }
                          onDelete={() => remove(e)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
