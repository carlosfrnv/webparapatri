"use client";

import { CaretRight, Exam, FolderOpen, NotePencil, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

/**
 * Carpeta de una asignatura en "Notas": los exámenes y entregas que ella pone en el calendario aparecen aquí solos,
 * con una casilla para apuntar la nota que saca (0-20). También se pueden añadir exámenes pasados.
 */

export interface GradedExam {
  id: string;
  kind: "exam" | "assignment";
  subject_id: string | null;
  title: string;
  exam_date: string;
  grade: number | null;
  days_left: number;
}

const PASS = 9.5;

const TEXT = {
  es: {
    folder: "Exámenes y trabajos",
    empty: "Aún no hay nada. Los exámenes que pongas en el calendario aparecerán aquí solos.",
    average: "media",
    exam: "Examen",
    assignment: "Trabajo",
    grade: "Nota",
    inDays: (n: number) => (n === 0 ? "Hoy" : n === 1 ? "Mañana" : `Faltan ${n} días`),
    add: "Añadir un examen ya hecho",
    title: "Qué era (p. ej., Teste 1)",
    date: "Fecha",
    save: "Guardar",
    invalid: "La nota va de 0 a 20.",
  },
  pt: {
    folder: "Exames e trabalhos",
    empty: "Ainda não há nada. Os exames que puseres no calendário aparecem aqui sozinhos.",
    average: "média",
    exam: "Exame",
    assignment: "Trabalho",
    grade: "Nota",
    inDays: (n: number) => (n === 0 ? "Hoje" : n === 1 ? "Amanhã" : `Faltam ${n} dias`),
    add: "Acrescentar um exame já feito",
    title: "O que era (p. ex., Teste 1)",
    date: "Data",
    save: "Guardar",
    invalid: "A nota vai de 0 a 20.",
  },
};

const fmt = (n: number, lang: Lang) =>
  n.toLocaleString(lang === "pt" ? "pt-PT" : "es-ES", { maximumFractionDigits: 2 });
const fmtDate = (d: string, lang: Lang) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(lang === "pt" ? "pt-PT" : "es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function ExamRow({ e, lang, onSaved }: { e: GradedExam; lang: Lang; onSaved: (e: GradedExam) => void }) {
  const tx = TEXT[lang];
  const [value, setValue] = useState(e.grade === null ? "" : String(e.grade).replace(".", ","));
  const [problem, setProblem] = useState("");
  async function save() {
    const g = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (g !== null && (isNaN(g) || g < 0 || g > 20)) return setProblem(tx.invalid);
    setProblem("");
    if (g === e.grade) return;
    try {
      await api.patch(`/exams/${e.id}`, { grade: g });
      onSaved({ ...e, grade: g });
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }
  const chip =
    e.grade === null
      ? null
      : e.grade >= PASS
        ? "bg-success-soft text-success"
        : "bg-danger-soft text-danger";
  return (
    <li className="flex items-center gap-3 py-2.5">
      {e.kind === "exam" ? (
        <Exam size={20} className="text-accent shrink-0" aria-hidden="true" />
      ) : (
        <NotePencil size={20} className="text-accent shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.title}</p>
        <p className="text-muted text-xs">
          {e.kind === "exam" ? tx.exam : tx.assignment} · {fmtDate(e.exam_date, lang)}
          {e.days_left >= 0 && ` · ${tx.inDays(e.days_left)}`}
        </p>
        {problem && <p className="text-danger text-xs">{problem}</p>}
      </div>
      <label className="w-20 shrink-0">
        <span className="sr-only">{`${tx.grade}: ${e.title}`}</span>
        <input
          className={`input min-h-10 px-2 text-center font-semibold ${chip ?? ""}`}
          inputMode="decimal"
          placeholder={tx.grade}
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          onBlur={save}
        />
      </label>
    </li>
  );
}

export function ExamFolder({
  subjectId,
  exams,
  lang,
  onChange,
}: {
  subjectId: string | null;
  exams: GradedExam[];
  lang: Lang;
  onChange: (list: GradedExam[]) => void;
}) {
  const tx = TEXT[lang];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const graded = exams.filter((e) => e.grade !== null);
  const avg = graded.length ? graded.reduce((s, e) => s + e.grade!, 0) / graded.length : null;
  // Primero lo más reciente (lo que acaba de hacer o lo que tiene más cerca).
  const sorted = [...exams].sort((a, b) => b.exam_date.localeCompare(a.exam_date));

  async function add() {
    if (!title.trim() || !date) return;
    setError("");
    try {
      const created = await api.post<GradedExam>("/exams", {
        kind: "exam",
        subject_id: subjectId,
        title: title.trim(),
        exam_date: date,
      });
      const today = new Date().toISOString().slice(0, 10);
      const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      onChange([...exams, { ...created, kind: "exam", grade: null, days_left: days }]);
      setTitle("");
      setDate("");
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <details className="group bg-surface-2 mx-4 mb-3 rounded-xl px-3 py-2 sm:mx-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <CaretRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
        <FolderOpen size={18} className="text-accent" aria-hidden="true" />
        <span className="flex-1">
          {tx.folder} ({exams.length})
        </span>
        {avg !== null && (
          <span className="text-muted font-normal">
            {tx.average} {fmt(avg, lang)}
          </span>
        )}
      </summary>
      {exams.length === 0 ? (
        <p className="text-muted mt-2 text-sm">{tx.empty}</p>
      ) : (
        <ul className="divide-border mt-1 divide-y">
          {sorted.map((e) => (
            <ExamRow
              key={e.id}
              e={e}
              lang={lang}
              onSaved={(n) => onChange(exams.map((x) => (x.id === n.id ? n : x)))}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            className="input min-h-10 flex-1 text-sm"
            placeholder={tx.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="date"
            className="input min-h-10 w-40 text-sm"
            aria-label={tx.date}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="btn-primary min-h-10" disabled={!title.trim() || !date} onClick={add}>
            {tx.save}
          </button>
          {error && <p className="text-danger w-full text-xs">{error}</p>}
        </div>
      ) : (
        <button className="btn-ghost mt-1 min-h-9 px-2 text-sm" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" /> {tx.add}
        </button>
      )}
    </details>
  );
}
