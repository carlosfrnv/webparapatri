"use client";

import { Heart, PencilSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { nombres } from "@/config/dedicatoria";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { GradientIcon } from "./GradientIcon";
import { localToday } from "./ExamPlan";

export type Role = "student" | "partner";

export interface LoveNote {
  id: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** Quién está usando la web: ella ("student") o Carlos ("partner"). */
export function useRole() {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    api
      .get<{ role: Role }>("/couple/me")
      .then((r) => setRole(r.role))
      .catch(() => setRole("student"));
  }, []);
  return role;
}

/** En el inicio de ella: las notas nuevas de Carlos, en grande, hasta que las guarda. */
export function NewNotes() {
  const t = useT();
  const tc = t.couple;
  const [notes, setNotes] = useState<LoveNote[]>([]);

  useEffect(() => {
    api
      .get<LoveNote[]>("/couple/notes")
      .then((list) => setNotes(list.filter((n) => !n.read_at).reverse()))
      .catch(() => undefined);
  }, []);

  if (notes.length === 0) return null;
  const note = notes[0];

  return (
    <section className="card relative mb-8 overflow-hidden border-2 border-[var(--accent)] p-6 sm:p-8" role="status">
      <p className="text-accent text-sm font-bold">{tc.newNote(nombres.el)}</p>
      <p className="font-display mt-3 text-xl leading-relaxed font-semibold whitespace-pre-line sm:text-2xl">
        {note.body}
      </p>
      <p className="mt-3 font-medium">— {nombres.el} 🖤</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          onClick={() => {
            api.post(`/couple/notes/${note.id}/read`).catch(() => undefined);
            setNotes((list) => list.slice(1));
          }}
        >
          {tc.keep}
        </button>
        {notes.length > 1 && <span className="text-muted text-sm">+{notes.length - 1} 💌</span>}
        <Link href="/buzon" className="text-accent text-sm font-semibold">
          {tc.seeAll}
        </Link>
      </div>
    </section>
  );
}

const daysUntil = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = localToday().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
};

/** Cuenta atrás para la próxima vez que se ven (la pueden poner los dos). */
export function VisitCountdown({ role }: { role: Role }) {
  const t = useT();
  const tc = t.couple;
  const [visit, setVisit] = useState<{ date: string; label?: string | null } | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [problem, setProblem] = useState("");
  const who = role === "partner" ? nombres.ella : nombres.el;

  useEffect(() => {
    api
      .get<{ date: string; label?: string | null } | null>("/couple/visit")
      .then(setVisit)
      .catch(() => setVisit(null));
  }, []);

  if (visit === undefined) return null;
  const days = visit ? daysUntil(visit.date) : null;
  // Si la fecha ya ha pasado, se pide la siguiente.
  const active = visit && days !== null && days >= 0;

  async function save(next: { date: string; label: string | null } | null) {
    try {
      setVisit(await api.put<{ date: string; label?: string | null } | null>("/couple/visit", next ?? {}));
      setEditing(false);
      setProblem("");
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <section className="card mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <GradientIcon icon={Heart} tone="pink" size={52} />
      {editing ? (
        <form
          className="flex flex-1 flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (date) save({ date, label: label.trim() || null });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tc.dateLabel}</span>
            <input
              className="input"
              type="date"
              required
              min={localToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium">{tc.noteLabel}</span>
            <input
              className="input"
              maxLength={80}
              placeholder={tc.notePlaceholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button className="btn-primary">{t.common.save}</button>
            {active && (
              <button type="button" className="btn-ghost" onClick={() => save(null)}>
                {tc.remove}
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </button>
          </div>
          {problem && <p className="text-danger w-full text-sm">{problem}</p>}
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-muted text-sm font-semibold">{tc.visitTitle}</p>
            {active ? (
              <>
                <p className="font-display text-xl font-extrabold sm:text-2xl">
                  {days === 0 ? tc.today : days === 1 ? tc.tomorrow(who) : tc.daysLeft(days!, who)}
                </p>
                {visit.label && <p className="text-muted mt-0.5 text-sm">{visit.label}</p>}
              </>
            ) : (
              <p className="mt-0.5">{tc.noVisit}</p>
            )}
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              setDate(active ? visit.date : "");
              setLabel(active ? (visit.label ?? "") : "");
              setEditing(true);
            }}
          >
            <PencilSimple size={18} weight="duotone" aria-hidden="true" /> {active ? tc.edit : tc.setDate}
          </button>
        </>
      )}
    </section>
  );
}
