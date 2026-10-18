"use client";

import { Student } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { GradientIcon } from "@/components/GradientIcon";
import { subjectLook } from "@/components/subjectLook";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { Subject } from "@/lib/types";

interface GradedSubject extends Subject {
  ects: number | null;
  grade: number | null;
}

// En Portugal se aprueba con 9,5 (se redondea a 10). La licenciatura tiene 240 ECTS.
const PASS = 9.5;
const DEGREE_ECTS = 240;

const fmt = (n: number, lang: string) =>
  n.toLocaleString(lang === "pt" ? "pt-PT" : "es-ES", { maximumFractionDigits: 2 });
const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/**
 * Media de las aprobadas, ponderada por créditos. Si alguna aprobada no tiene créditos puestos,
 * se hace la media simple (para no dar una media rara).
 */
function average(subjects: { ects: number | null; grade: number | null }[]) {
  const passed = subjects.filter((s) => s.grade !== null && s.grade >= PASS);
  if (passed.length === 0) return null;
  const weighted = passed.every((s) => s.ects && s.ects > 0);
  const total = passed.reduce((sum, s) => sum + (weighted ? s.ects! : 1), 0);
  return { value: passed.reduce((sum, s) => sum + s.grade! * (weighted ? s.ects! : 1), 0) / total, weighted };
}

function Row({ s, onSaved }: { s: GradedSubject; onSaved: (s: GradedSubject) => void }) {
  const t = useT();
  const tg = t.grades;
  const [ects, setEcts] = useState(s.ects === null ? "" : String(s.ects).replace(".", ","));
  const [grade, setGrade] = useState(s.grade === null ? "" : String(s.grade).replace(".", ","));
  const [problem, setProblem] = useState("");
  const look = subjectLook(s);

  async function save() {
    const e = parse(ects);
    const g = parse(grade);
    if ((e !== null && (isNaN(e) || e < 0 || e > 60)) || (g !== null && (isNaN(g) || g < 0 || g > 20)))
      return setProblem(tg.invalid);
    setProblem("");
    if (e === s.ects && g === s.grade) return;
    try {
      onSaved({
        ...s,
        ...(await api.patch<{ ects: number | null; grade: number | null }>(`/subjects/${s.id}/grade`, {
          ects: e,
          grade: g,
        })),
      });
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  const status =
    s.grade === null
      ? { text: tg.pending, cls: "bg-surface-2 text-muted" }
      : s.grade >= PASS
        ? { text: tg.passed, cls: "bg-success-soft text-success" }
        : { text: tg.failed, cls: "bg-danger-soft text-danger" };

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <GradientIcon icon={look.icon} tone={look.tone} size={36} />
      <div className="min-w-[9rem] flex-1">
        <p className="font-medium">{s.name}</p>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${status.cls}`}>
          {status.text}
        </span>
        {problem && <p className="text-danger mt-1 text-xs">{problem}</p>}
      </div>
      <label className="w-20">
        <span className="text-muted block text-xs">{tg.ects}</span>
        <input
          className="input min-h-10 px-2 text-center"
          inputMode="decimal"
          value={ects}
          placeholder="—"
          onChange={(e) => setEcts(e.target.value)}
          onBlur={save}
          aria-label={`${tg.ects}: ${s.name}`}
        />
      </label>
      <label className="w-24">
        <span className="text-muted block text-xs">{tg.grade}</span>
        <input
          className="input min-h-10 px-2 text-center font-semibold"
          inputMode="decimal"
          value={grade}
          placeholder="—"
          onChange={(e) => setGrade(e.target.value)}
          onBlur={save}
          aria-label={`${tg.grade}: ${s.name}`}
        />
      </label>
    </li>
  );
}

export default function GradesPage() {
  const t = useT();
  const tg = t.grades;
  const lang = useLang();
  const [subjects, setSubjects] = useState<GradedSubject[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSubjects(await api.get<GradedSubject[]>("/subjects/grades/all"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  if (error) return <ErrorBox message={error} />;
  if (!subjects) return <Spinner label={t.common.loading} />;

  const avg = average(subjects);
  const passed = subjects.filter((s) => s.grade !== null && s.grade >= PASS);
  const ectsDone = passed.reduce((sum, s) => sum + (s.ects ?? 0), 0);
  const years = [...new Set(subjects.map((s) => s.year))].sort((a, b) => (a ?? 9) - (b ?? 9));

  return (
    <>
      <PageHeader icon={Student} title={tg.title} subtitle={tg.subtitle} />

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-muted text-sm">{tg.average}</p>
          <p className="font-display text-accent mt-1 text-4xl font-extrabold">{avg ? fmt(avg.value, lang) : "—"}</p>
          <p className="text-muted mt-1 text-xs">{avg ? (avg.weighted ? tg.weighted : tg.simple) : tg.noGrades}</p>
        </div>
        <div className="card p-5">
          <p className="text-muted text-sm">{tg.passedCount}</p>
          <p className="font-display mt-1 text-4xl font-extrabold">
            {passed.length}
            <span className="text-muted text-xl"> / {subjects.length}</span>
          </p>
        </div>
        <div className="card p-5">
          <p className="text-muted text-sm">{tg.ectsDone}</p>
          <p className="font-display mt-1 text-4xl font-extrabold">
            {fmt(ectsDone, lang)}
            <span className="text-muted text-xl"> / {DEGREE_ECTS}</span>
          </p>
          <div className="bg-surface-2 mt-2 h-2 overflow-hidden rounded-full" aria-hidden="true">
            <div
              className="bg-success h-full rounded-full"
              style={{ width: `${Math.min(100, (ectsDone / DEGREE_ECTS) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      <p className="text-muted mb-4 text-sm">{tg.help}</p>

      <div className="space-y-6">
        {years.map((year) => (
          <section key={year ?? "none"} className="card overflow-hidden p-0">
            <h2 className="border-border border-b px-4 py-3 font-bold sm:px-5">
              {year ? tg.yearTitle(year) : tg.noYear}
            </h2>
            <ul className="divide-border divide-y">
              {subjects
                .filter((s) => s.year === year)
                .map((s) => (
                  <Row
                    key={s.id}
                    s={s}
                    onSaved={(n) => setSubjects((list) => list!.map((x) => (x.id === n.id ? n : x)))}
                  />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
