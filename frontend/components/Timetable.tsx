"use client";

import { MapPin, Plus, Trash, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { BlockColor, ScheduleBlock, Subject } from "@/lib/types";
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

const HOUR_PX = 56;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pad = (n: number) => String(n).padStart(2, "0");
/** Día de hoy en el formato del horario (1 = lunes … 7 = domingo). */
export const todayDay = () => ((new Date().getDay() + 6) % 7) + 1;

function useDayNames() {
  const lang = useLang();
  // 2024-01-01 fue lunes.
  return (day: number, style: "short" | "long") => {
    const name = new Date(2024, 0, day).toLocaleDateString(dateLocale(lang), { weekday: style }).replace(".", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
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
  const dayName = useDayNames();
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

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
          if (d.end_time <= d.start_time) return setProblem(t.calendar.schedule.badTime);
          setSaving(true);
          try {
            await onSave(d);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="block-form-title" className="text-lg font-bold">
            {d.id ? t.calendar.schedule.editTitle : t.calendar.schedule.addTitle}
          </h2>
          <button type="button" className="btn-ghost px-2" onClick={onClose} aria-label={t.common.close}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.calendar.schedule.subject}</span>
          <select
            className="input"
            value={d.subject_id ?? ""}
            onChange={(e) => {
              const s = subjects.find((x) => x.id === e.target.value);
              set({
                subject_id: s?.id ?? null,
                ...(s && !d.title.trim() ? { title: s.name } : {}),
                ...(s ? { color: subjectLook(s).tone } : {}),
              });
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

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.calendar.schedule.what}</span>
          <input
            className="input"
            required
            maxLength={80}
            placeholder={t.calendar.schedule.whatPlaceholder}
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 block sm:col-span-1">
            <span className="mb-1 block text-sm font-medium">{t.calendar.schedule.day}</span>
            <select className="input" value={d.day} onChange={(e) => set({ day: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {dayName(n, "long")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t.calendar.schedule.start}</span>
            <input
              className="input"
              type="time"
              step={300}
              required
              value={d.start_time}
              onChange={(e) => {
                setProblem("");
                set({ start_time: e.target.value });
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t.calendar.schedule.end}</span>
            <input
              className="input"
              type="time"
              step={300}
              required
              value={d.end_time}
              onChange={(e) => {
                setProblem("");
                set({ end_time: e.target.value });
              }}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.calendar.schedule.location}</span>
          <input
            className="input"
            maxLength={80}
            placeholder={t.calendar.schedule.locationPlaceholder}
            value={d.location ?? ""}
            onChange={(e) => set({ location: e.target.value || null })}
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t.calendar.schedule.color}</legend>
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
                if (confirm(t.calendar.schedule.confirmDelete(d.title))) await onDelete();
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

function BlockCard({ b, onClick, compact = false }: { b: ScheduleBlock; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`h-full w-full overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left shadow-sm transition-transform hover:scale-[1.02] ${BLOCK_STYLE[b.color].block}`}
    >
      <span className="block truncate text-xs font-bold">{b.title}</span>
      <span className="block text-[11px] opacity-80">
        {b.start_time}–{b.end_time}
      </span>
      {b.location && !compact && (
        <span className="flex items-center gap-0.5 truncate text-[11px] opacity-80">
          <MapPin size={11} weight="fill" aria-hidden="true" /> {b.location}
        </span>
      )}
    </button>
  );
}

/** Horario semanal editable: rejilla por horas en el ordenador y lista por días en el móvil. */
export function Timetable({ subjects }: { subjects: Subject[] }) {
  const t = useT();
  const dayName = useDayNames();
  const lang = useLang();
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mobileDay, setMobileDay] = useState(todayDay);
  const [weekend, setWeekend] = useState(false);

  const load = useCallback(async () => {
    try {
      setBlocks(await api.get<ScheduleBlock[]>("/schedule"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  const newDraft = (day: number, hour = 9): Draft => ({
    day,
    start_time: `${pad(hour)}:00`,
    end_time: `${pad(Math.min(hour + 1, 23))}:00`,
    title: "",
    subject_id: null,
    location: null,
    color: "pink",
  });

  async function save(d: Draft) {
    const body = {
      day: d.day,
      start_time: d.start_time,
      end_time: d.end_time,
      title: d.title.trim(),
      subject_id: d.subject_id,
      location: d.location?.trim() || null,
      color: d.color,
    };
    try {
      if (d.id) await api.patch(`/schedule/${d.id}`, body);
      else await api.post("/schedule", body);
      setDraft(null);
      await load();
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

  const hasWeekend = blocks.some((b) => b.day >= 6);
  const days = weekend || hasWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const startHour = Math.min(8, ...blocks.map((b) => Math.floor(toMin(b.start_time) / 60)));
  const endHour = Math.max(20, ...blocks.map((b) => Math.ceil(toMin(b.end_time) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const today = todayDay();
  const edit = (b: ScheduleBlock) => setDraft({ ...b });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t.calendar.schedule.title}</h2>
          <p className="text-muted text-sm">{t.calendar.schedule.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {!hasWeekend && (
            <label className="text-muted hidden items-center gap-2 text-sm md:flex">
              <input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} />
              {t.calendar.schedule.weekend}
            </label>
          )}
          <button className="btn-primary" onClick={() => setDraft(newDraft(mobileDay))}>
            <Plus size={18} weight="bold" aria-hidden="true" /> {t.calendar.schedule.add.replace("+ ", "")}
          </button>
        </div>
      </div>

      {blocks.length === 0 && <p className="card text-muted p-4 text-sm">{t.calendar.schedule.empty}</p>}

      {/* Ordenador: rejilla semanal por horas */}
      <div className="card hidden overflow-x-auto p-3 md:block">
        <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div
              key={d}
              className={`pb-2 text-center text-sm font-semibold ${d === today ? "text-accent" : "text-muted"}`}
            >
              {dayName(d, "short")}
            </div>
          ))}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="text-muted absolute right-2 -translate-y-1/2 text-[11px]"
                style={{ top: i * HOUR_PX }}
              >
                {pad(h)}:00
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={`border-border relative border-l ${d === today ? "bg-accent-soft/40" : ""}`}
              style={{ height: hours.length * HOUR_PX }}
            >
              {hours.map((h, i) => (
                <button
                  key={h}
                  className="border-border hover:bg-surface-2 absolute inset-x-0 border-t border-dashed"
                  style={{ top: i * HOUR_PX, height: HOUR_PX }}
                  onClick={() => setDraft(newDraft(d, h))}
                  aria-label={`${t.calendar.schedule.addTitle}: ${dayName(d, "long")} ${pad(h)}:00`}
                />
              ))}
              {blocks
                .filter((b) => b.day === d)
                .map((b) => {
                  const top = ((toMin(b.start_time) - startHour * 60) / 60) * HOUR_PX;
                  const height = Math.max(24, ((toMin(b.end_time) - toMin(b.start_time)) / 60) * HOUR_PX - 2);
                  return (
                    <div key={b.id} className="absolute inset-x-1" style={{ top: top + 1, height }}>
                      <BlockCard b={b} onClick={() => edit(b)} compact={height < 50} />
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
              className={`relative min-h-10 rounded-lg text-sm font-semibold ${
                mobileDay === d ? "bg-surface text-accent shadow-sm" : "text-muted"
              }`}
            >
              {dayName(d, "short").slice(0, 2)}
              {blocks.some((b) => b.day === d) && (
                <span className="bg-accent absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" />
              )}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold">{dayName(mobileDay, "long")}</p>
        {blocks.filter((b) => b.day === mobileDay).length === 0 ? (
          <p className="card text-muted p-4 text-sm">{t.calendar.schedule.emptyDay}</p>
        ) : (
          <ul className="space-y-2">
            {blocks
              .filter((b) => b.day === mobileDay)
              .map((b) => (
                <li key={b.id} className="min-h-16">
                  <BlockCard b={b} onClick={() => edit(b)} />
                </li>
              ))}
          </ul>
        )}
      </div>

      {draft && (
        <BlockForm
          key={draft.id ?? `${draft.day}-${draft.start_time}`}
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
