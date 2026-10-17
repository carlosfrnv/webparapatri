"use client";

import { CaretLeft, CaretRight, ChalkboardTeacher, Copy, MapPin, Plus, Trash, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { BlockColor, ScheduleBlock, Subject } from "@/lib/types";
import { localToday, toIsoDate } from "./ExamPlan";
import { subjectLook } from "./subjectLook";
import { ErrorBox, Spinner } from "./ui";

// Colores de los bloques: fondo suave, borde de color y texto oscuro (y su versión para el modo oscuro).
export const BLOCK_STYLE: Record<BlockColor, { block: string; swatch: string }> = {
  pink: {
    block: "bg-[#fde7f2] border-[#ec4899] text-[#831843] dark:bg-[#ec4899]/20 dark:text-[#fbcfe8]",
    swatch: "bg-[#ec4899]",
  },
  violet: {
    block: "bg-[#ede9fe] border-[#7c3aed] text-[#4c1d95] dark:bg-[#7c3aed]/25 dark:text-[#ddd6fe]",
    swatch: "bg-[#7c3aed]",
  },
  teal: {
    block: "bg-[#ccfbf1] border-[#14b8a6] text-[#134e4a] dark:bg-[#14b8a6]/20 dark:text-[#99f6e4]",
    swatch: "bg-[#14b8a6]",
  },
  amber: {
    block: "bg-[#fef3c7] border-[#f59e0b] text-[#78350f] dark:bg-[#f59e0b]/20 dark:text-[#fde68a]",
    swatch: "bg-[#f59e0b]",
  },
  blue: {
    block: "bg-[#dbeafe] border-[#3b82f6] text-[#1e3a8a] dark:bg-[#3b82f6]/20 dark:text-[#bfdbfe]",
    swatch: "bg-[#3b82f6]",
  },
  slate: {
    block: "bg-[#ede9f3] border-[#8b84b0] text-[#3f3a5a] dark:bg-[#8b84b0]/25 dark:text-[#e4e1f0]",
    swatch: "bg-[#8b84b0]",
  },
};
const COLORS = Object.keys(BLOCK_STYLE) as BlockColor[];

const CLASS_TYPES = ["T", "TP", "PL", "OT", "S", "E"];

// Como el horario de la escuela: franjas de media hora (9:00, 9:30, 10:00…).
const SLOT_MIN = 30;
const SLOT_PX = 34;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pad = (n: number) => String(n).padStart(2, "0");
const toTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
/** Día de hoy en el formato del horario (1 = lunes … 7 = domingo). */
export const todayDay = () => ((new Date().getDay() + 6) % 7) + 1;

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, n: number) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};
/** Lunes de la semana de esa fecha. */
const mondayOf = (iso: string) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));
const weekdayOf = (iso: string) => ((parseIso(iso).getDay() + 6) % 7) + 1;

/** Si un bloque toca en esa fecha: los de un día concreto solo ese día, los semanales todas las semanas. */
export const blockOnDate = (b: ScheduleBlock, iso: string) => (b.date ? b.date === iso : b.day === weekdayOf(iso));

function useDayNames() {
  const lang = useLang();
  // 2024-01-01 fue lunes.
  return (day: number, style: "short" | "long") => {
    const name = new Date(2024, 0, day).toLocaleDateString(dateLocale(lang), { weekday: style }).replace(".", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
}

/** "Lunes, 21 de septiembre" */
function useLongDate() {
  const lang = useLang();
  return (iso: string) => {
    const s = parseIso(iso).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
}

type Draft = Omit<ScheduleBlock, "id"> & { id?: string };

function BlockForm({
  initial,
  subjects,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Draft;
  subjects: Subject[];
  onSave: (d: Draft) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const ts = t.calendar.schedule;
  const dayName = useDayNames();
  const [d, setD] = useState(initial);
  // Fecha que se recuerda al marcar y desmarcar "repetir".
  const [lastDate, setLastDate] = useState(initial.date ?? localToday());
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (patch: Partial<Draft>) => {
    setProblem("");
    setD((x) => ({ ...x, ...patch }));
  };
  const subjectName = subjects.find((s) => s.id === d.subject_id)?.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-form-title"
      onClick={onClose}
    >
      <form
        className="card max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-b-none p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (d.end_time <= d.start_time) return setProblem(ts.badTime);
          const title = d.title.trim() || subjectName || "";
          if (!title) return setProblem(ts.needName);
          setSaving(true);
          try {
            await onSave({ ...d, title });
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="block-form-title" className="text-lg font-bold">
            {d.id ? ts.editTitle : ts.addTitle}
          </h2>
          <button type="button" className="btn-ghost px-2" onClick={onClose} aria-label={t.common.close}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Mismo orden que el horario de la escuela: día, hora, asignatura, tipo de clase y profesor. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 block sm:col-span-1">
            <span className="mb-1 block text-sm font-medium">{d.date ? ts.date : ts.day}</span>
            {d.date ? (
              <input
                className="input"
                type="date"
                required
                value={d.date}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setLastDate(e.target.value);
                  set({ date: e.target.value, day: weekdayOf(e.target.value) });
                }}
              />
            ) : (
              <select className="input" value={d.day} onChange={(e) => set({ day: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {dayName(n, "long")}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{ts.start}</span>
            <input
              className="input"
              type="time"
              step={300}
              required
              value={d.start_time}
              onChange={(e) => set({ start_time: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{ts.end}</span>
            <input
              className="input"
              type="time"
              step={300}
              required
              value={d.end_time}
              onChange={(e) => set({ end_time: e.target.value })}
            />
          </label>
        </div>
        <label className="text-muted -mt-1 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!d.date}
            onChange={(e) =>
              e.target.checked ? set({ date: null }) : set({ date: lastDate, day: weekdayOf(lastDate) })
            }
          />
          {ts.repeat}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{ts.subject}</span>
          <select
            className="input"
            value={d.subject_id ?? ""}
            onChange={(e) => {
              const s = subjects.find((x) => x.id === e.target.value);
              set({ subject_id: s?.id ?? null, ...(s ? { color: subjectLook(s).tone } : {}) });
            }}
          >
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{ts.classType}</span>
            <select
              className="input"
              value={d.class_type ?? ""}
              onChange={(e) => set({ class_type: e.target.value || null })}
            >
              <option value="">—</option>
              {CLASS_TYPES.map((c) => (
                <option key={c} value={c}>
                  {ts.classTypes[c]}
                </option>
              ))}
              {d.class_type && !CLASS_TYPES.includes(d.class_type) && (
                <option value={d.class_type}>{d.class_type}</option>
              )}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{ts.teacher}</span>
            <input
              className="input"
              maxLength={80}
              placeholder={ts.teacherPlaceholder}
              value={d.teacher ?? ""}
              onChange={(e) => set({ teacher: e.target.value || null })}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{ts.what}</span>
          <input
            className="input"
            maxLength={80}
            placeholder={subjectName ?? ts.whatPlaceholder}
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          <span className="text-muted mt-1 block text-xs">{ts.whatHint}</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{ts.location}</span>
          <input
            className="input"
            maxLength={80}
            placeholder={ts.locationPlaceholder}
            value={d.location ?? ""}
            onChange={(e) => set({ location: e.target.value || null })}
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{ts.color}</legend>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: c })}
                aria-label={c}
                aria-pressed={d.color === c}
                className={`h-9 w-9 rounded-full ${BLOCK_STYLE[c].swatch} ${
                  d.color === c ? "ring-text ring-offset-surface ring-2 ring-offset-2" : ""
                }`}
              />
            ))}
          </div>
        </fieldset>

        {problem && <p className="bg-danger-soft rounded-xl p-3 text-sm">{problem}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {d.id ? (
            <button
              type="button"
              className="btn-ghost text-danger px-3"
              onClick={async () => {
                if (confirm(ts.confirmDelete(d.title))) await onDelete();
              }}
            >
              <Trash size={18} weight="duotone" aria-hidden="true" /> {t.common.delete}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {t.common.cancel}
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/** "T · Altino Cunha" */
export const blockDetails = (b: ScheduleBlock) => [b.class_type, b.teacher].filter(Boolean).join(" · ");

function BlockCard({ b, onClick, compact = false }: { b: ScheduleBlock; onClick: () => void; compact?: boolean }) {
  const t = useT();
  const details = blockDetails(b);
  return (
    <button
      onClick={onClick}
      className={`flex h-full w-full flex-col items-stretch justify-start overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left shadow-sm transition-transform hover:scale-[1.02] ${BLOCK_STYLE[b.color].block}`}
    >
      <span className="block truncate text-xs font-bold">{b.title}</span>
      {details && (
        <span className="flex items-center gap-0.5 truncate text-[11px] font-medium opacity-90">
          <ChalkboardTeacher size={11} weight="fill" aria-hidden="true" /> {details}
        </span>
      )}
      <span className="block text-[11px] opacity-80">
        {b.start_time}–{b.end_time}
        {!b.date && !compact && ` · ${t.calendar.schedule.weekly}`}
      </span>
      {b.location && !compact && (
        <span className="flex items-center gap-0.5 truncate text-[11px] opacity-80">
          <MapPin size={11} weight="fill" aria-hidden="true" /> {b.location}
        </span>
      )}
    </button>
  );
}

/**
 * Horario editable semana a semana (el de la escuela cambia cada semana):
 * rejilla por horas en el ordenador y lista por días en el móvil.
 */
export function Timetable({ subjects }: { subjects: Subject[] }) {
  const t = useT();
  const ts = t.calendar.schedule;
  const dayName = useDayNames();
  const longDate = useLongDate();
  const lang = useLang();
  const today = localToday();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mobileDay, setMobileDay] = useState(todayDay);
  const [weekend, setWeekend] = useState(false);

  const load = useCallback(async () => {
    try {
      setBlocks(await api.get<ScheduleBlock[]>(`/schedule?from=${monday}&to=${addDays(monday, 6)}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [monday]);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  const dateOf = (day: number) => addDays(monday, day - 1);

  const newDraft = (day: number, startMin = 9 * 60): Draft => ({
    day,
    date: dateOf(day),
    start_time: toTime(startMin),
    end_time: toTime(Math.min(startMin + 60, 23 * 60 + 55)),
    title: "",
    subject_id: null,
    location: null,
    class_type: null,
    teacher: null,
    color: "pink",
  });

  async function save(d: Draft) {
    const body = {
      day: d.day,
      date: d.date,
      start_time: d.start_time,
      end_time: d.end_time,
      title: d.title.trim(),
      subject_id: d.subject_id,
      location: d.location?.trim() || null,
      class_type: d.class_type,
      teacher: d.teacher?.trim() || null,
      color: d.color,
    };
    try {
      if (d.id) await api.patch(`/schedule/${d.id}`, body);
      else await api.post("/schedule", body);
      setDraft(null);
      // Si la ha puesto en otra semana, se va a esa semana para verla.
      if (d.date && mondayOf(d.date) !== monday) setMonday(mondayOf(d.date));
      else await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/schedule/${id}`);
      setDraft(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function goWeek(next: string) {
    setNotice("");
    setMonday(next);
  }

  async function copyWeek(count: number) {
    if (!confirm(ts.confirmCopy(count))) return;
    try {
      const { copied } = await api.post<{ copied: number }>("/schedule/copy-week", {
        from: monday,
        to: addDays(monday, 7),
      });
      setMonday(addDays(monday, 7));
      setNotice(ts.copied(copied));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error)
    return (
      <ErrorBox
        message={error}
        onRetry={() => {
          setError("");
          load();
        }}
      />
    );
  if (!blocks) return <Spinner label={t.common.loading} />;

  const onDay = (day: number) => blocks.filter((b) => blockOnDate(b, dateOf(day)));
  const weekBlocks = [1, 2, 3, 4, 5, 6, 7].flatMap(onDay);
  const datedThisWeek = weekBlocks.filter((b) => b.date).length;
  const hasSunday = onDay(7).length > 0;
  // Como en el horario de la escuela: de lunes a sábado (el domingo solo si hay algo o si lo pide).
  const days = weekend || hasSunday ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
  const roundDown = (m: number) => Math.floor(m / SLOT_MIN) * SLOT_MIN;
  const roundUp = (m: number) => Math.ceil(m / SLOT_MIN) * SLOT_MIN;
  const startMin = Math.min(9 * 60, ...weekBlocks.map((b) => roundDown(toMin(b.start_time))));
  const endMin = Math.max(18 * 60 + 30, ...weekBlocks.map((b) => roundUp(toMin(b.end_time))));
  const slots = Array.from({ length: (endMin - startMin) / SLOT_MIN }, (_, i) => startMin + i * SLOT_MIN);
  const edit = (b: ScheduleBlock) => setDraft({ ...b });
  const isThisWeek = monday === mondayOf(today);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    parseIso(iso).toLocaleDateString(dateLocale(lang), opts).replace(".", "");
  const sunday = addDays(monday, 6);
  const range =
    monday.slice(0, 7) === sunday.slice(0, 7)
      ? `${fmt(monday, { day: "numeric" })}–${fmt(sunday, { day: "numeric", month: "long", year: "numeric" })}`
      : `${fmt(monday, { day: "numeric", month: "short" })} – ${fmt(sunday, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{ts.title}</h2>
          <p className="text-muted text-sm">{ts.subtitle}</p>
        </div>
        <button className="btn-primary" onClick={() => setDraft(newDraft(mobileDay))}>
          <Plus size={18} weight="bold" aria-hidden="true" /> {ts.add.replace("+ ", "")}
        </button>
      </div>

      {/* Cambiar de semana */}
      <div className="card flex flex-wrap items-center justify-between gap-2 p-2">
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={() => goWeek(addDays(monday, -7))} aria-label={ts.prevWeek}>
            <CaretLeft size={20} weight="bold" aria-hidden="true" />
          </button>
          <span className="min-w-40 text-center font-semibold">{range}</span>
          <button className="btn-ghost px-2" onClick={() => goWeek(addDays(monday, 7))} aria-label={ts.nextWeek}>
            <CaretRight size={20} weight="bold" aria-hidden="true" />
          </button>
          {!isThisWeek && (
            <button className="btn-ghost text-accent px-3 text-sm" onClick={() => goWeek(mondayOf(today))}>
              {ts.thisWeek}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!hasSunday && (
            <label className="text-muted hidden items-center gap-2 text-sm md:flex">
              <input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} />
              {ts.weekend}
            </label>
          )}
          {datedThisWeek > 0 && (
            <button className="btn-ghost px-3 text-sm" onClick={() => copyWeek(datedThisWeek)}>
              <Copy size={18} weight="duotone" aria-hidden="true" /> {ts.copyWeek}
            </button>
          )}
        </div>
      </div>

      {notice && <p className="bg-success-soft rounded-xl p-3 text-sm">{notice}</p>}
      {weekBlocks.length === 0 && <p className="card text-muted p-4 text-sm">{ts.empty}</p>}

      {/* Ordenador: rejilla semanal por horas */}
      <div className="card hidden overflow-x-auto p-3 md:block">
        <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div
              key={d}
              className={`pb-2 text-center text-sm font-semibold ${dateOf(d) === today ? "text-accent" : "text-muted"}`}
            >
              {dayName(d, "short")} <span className="text-base">{parseIso(dateOf(d)).getDate()}</span>
            </div>
          ))}
          <div className="relative" style={{ height: slots.length * SLOT_PX }}>
            {[...slots, endMin].map((m, i) => (
              <span
                key={m}
                className={`absolute right-2 -translate-y-1/2 text-[11px] ${m % 60 ? "text-muted/70" : "text-muted font-semibold"}`}
                style={{ top: i * SLOT_PX }}
              >
                {toTime(m)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={`border-border relative border-l ${dateOf(d) === today ? "bg-accent-soft/40" : ""}`}
              style={{ height: slots.length * SLOT_PX }}
            >
              {slots.map((m, i) => (
                <button
                  key={m}
                  className={`border-border hover:bg-surface-2 absolute inset-x-0 border-t ${m % 60 ? "border-dotted opacity-60" : "border-dashed"}`}
                  style={{ top: i * SLOT_PX, height: SLOT_PX }}
                  onClick={() => setDraft(newDraft(d, m))}
                  aria-label={`${ts.addTitle}: ${longDate(dateOf(d))} ${toTime(m)}`}
                />
              ))}
              {onDay(d).map((b) => {
                const top = ((toMin(b.start_time) - startMin) / SLOT_MIN) * SLOT_PX;
                const height = Math.max(24, ((toMin(b.end_time) - toMin(b.start_time)) / SLOT_MIN) * SLOT_PX - 2);
                return (
                  <div key={b.id} className="absolute inset-x-1" style={{ top: top + 1, height }}>
                    <BlockCard b={b} onClick={() => edit(b)} compact={height < 60} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Móvil: un día cada vez */}
      <div className="space-y-3 md:hidden">
        <div className="bg-surface-2 grid grid-cols-7 gap-1 rounded-xl p-1" role="tablist">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={mobileDay === d}
              onClick={() => setMobileDay(d)}
              className={`relative min-h-12 rounded-lg pb-1 text-xs font-semibold leading-tight ${
                mobileDay === d
                  ? "bg-surface text-accent shadow-sm"
                  : dateOf(d) === today
                    ? "text-accent"
                    : "text-muted"
              }`}
            >
              {dayName(d, "short").slice(0, 2)}
              <span className="block text-sm">{parseIso(dateOf(d)).getDate()}</span>
              {onDay(d).length > 0 && (
                <span className="bg-accent absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" />
              )}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold">{longDate(dateOf(mobileDay))}</p>
        {onDay(mobileDay).length === 0 ? (
          <p className="card text-muted p-4 text-sm">{ts.emptyDay}</p>
        ) : (
          <ul className="space-y-2">
            {onDay(mobileDay).map((b) => (
              <li key={b.id} className="min-h-16">
                <BlockCard b={b} onClick={() => edit(b)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft && (
        <BlockForm
          key={draft.id ?? `${draft.date ?? draft.day}-${draft.start_time}`}
          initial={draft}
          subjects={subjects}
          onSave={save}
          onDelete={() => remove(draft.id!)}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
