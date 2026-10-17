"use client";

import { Books, Broom, GraduationCap, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { GradientIcon } from "@/components/GradientIcon";
import { subjectLook } from "@/components/subjectLook";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { SubjectForm } from "@/components/SubjectForm";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { localSourceHref } from "@/components/Sources";
import { UploadZone } from "@/components/UploadZone";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { DocumentItem, Source, Subject } from "@/lib/types";

const YEARS = [1, 2, 3, 4] as const;

function SearchBox() {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Source[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setLoading(true);
    setError("");
    try {
      setResults(await api.get<Source[]>(`/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-8">
      <form onSubmit={search} className="flex gap-2" role="search">
        <input
          className="input"
          type="search"
          placeholder={t.library.searchPlaceholder}
          aria-label={t.library.searchLabel}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value) setResults(null);
          }}
        />
        <button className="btn-secondary shrink-0" disabled={loading}>
          {loading ? (
            "…"
          ) : (
            <>
              <MagnifyingGlass size={18} weight="bold" aria-hidden="true" /> {t.library.search}
            </>
          )}
        </button>
      </form>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
      {results && (
        <div className="mt-3">
          {results.length === 0 ? (
            <p className="text-muted">{t.library.noResults}</p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.chunk_id}>
                  <Link
                    href={localSourceHref(r)}
                    className={`card card-hover block p-3 ${r.kind === "referencia" ? "bg-warning-soft" : ""}`}
                  >
                    <p className="text-sm font-semibold">
                      {r.kind === "referencia" && <span>📚 {t.reference.badge(r.org ?? "IAEA / EFRS")} · </span>}
                      {r.document_title}
                      {r.page ? (
                        <span className="text-muted font-normal">
                          {" "}
                          · {t.library.page} {r.page}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted mt-1 text-sm">{r.excerpt}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const t = useT();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [unassigned, setUnassigned] = useState<DocumentItem[]>([]);
  const [year, setYear] = useState<number | "none">(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("library-year") : null;
      return saved === "none" ? "none" : saved ? Number(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  // Al cambiar de idioma se vuelven a pedir los datos (p. ej., los nombres de las asignaturas).
  const lang = useLang();
  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<Subject[]>("/subjects"),
        api.get<DocumentItem[]>("/documents?subject_id=none"),
      ]);
      setSubjects(s);
      setUnassigned(d);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  // Cuando se asigna un archivo sin asignatura, sale de esta lista y sube el contador de la asignatura.
  function onAssigned(doc: DocumentItem) {
    setUnassigned((list) => list.filter((d) => d.id !== doc.id));
    setSubjects(
      (subs) =>
        subs?.map((s) => (s.id === doc.subject_id ? { ...s, document_count: (s.document_count ?? 0) + 1 } : s)) ?? subs,
    );
  }

  function chooseYear(y: number | "none") {
    setYear(y);
    try {
      localStorage.setItem("library-year", String(y));
    } catch {
      /* se ignora */
    }
  }

  // Asignaturas sin ningún archivo (p. ej., las de ejemplo que se crean al principio).
  const emptySubjects = (subjects ?? []).filter((s) => !s.document_count);

  async function deleteSubject(subject: Subject) {
    if (!confirm(t.subject.confirmDelete(subject.name))) return;
    try {
      await api.del(`/subjects/${subject.id}`);
      setSubjects((list) => list?.filter((x) => x.id !== subject.id) ?? list);
      // Si tenía archivos, pasan a "sin asignatura".
      if (subject.document_count) load();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function clearEmpty() {
    if (!confirm(t.library.confirmClearEmpty(emptySubjects.length))) return;
    try {
      await Promise.all(emptySubjects.map((s) => api.del(`/subjects/${s.id}`)));
      const removed = new Set(emptySubjects.map((s) => s.id));
      setSubjects((list) => list?.filter((x) => !removed.has(x.id)) ?? list);
    } catch (err) {
      alert(errorMessage(err));
      load();
    }
  }

  const visible = (subjects ?? []).filter((s) => (year === "none" ? !s.year : s.year === year));
  const hasNoYear = (subjects ?? []).some((s) => !s.year);
  const tabClass = (active: boolean) =>
    `min-h-10 rounded-lg px-4 text-sm font-medium whitespace-nowrap ${active ? "bg-surface text-text shadow-sm" : "text-muted"}`;

  return (
    <>
      <PageHeader icon={Books} title={t.library.title} subtitle={t.library.subtitle} />

      <SearchBox />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t.library.upload}</h2>
        <UploadZone subjectId={null} onUploaded={(doc) => setUnassigned((list) => [doc, ...list])} />
        <p className="text-muted mt-2 text-sm">{t.library.uploadTip}</p>
      </section>

      {unassigned.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{t.library.unassigned}</h2>
          <DocumentList
            docs={unassigned}
            setDocs={setUnassigned}
            onAssigned={onAssigned}
            subjects={subjects ?? []}
            reorderable
          />
        </section>
      )}

      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!subjects && !error && <Spinner label={t.library.loadingSubjects} />}

      {subjects && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div
              className="bg-surface-2 flex gap-1 overflow-x-auto rounded-xl p-1"
              role="tablist"
              aria-label={t.library.year}
            >
              {YEARS.map((y) => (
                <button
                  key={y}
                  role="tab"
                  aria-selected={year === y}
                  className={tabClass(year === y)}
                  onClick={() => chooseYear(y)}
                >
                  {t.library.yearN(y)}
                </button>
              ))}
              {hasNoYear && (
                <button
                  role="tab"
                  aria-selected={year === "none"}
                  className={tabClass(year === "none")}
                  onClick={() => chooseYear("none")}
                >
                  {t.library.other}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {emptySubjects.length > 0 && (
                <button className="btn-ghost text-sm" onClick={clearEmpty}>
                  <Broom size={18} weight="duotone" aria-hidden="true" /> {t.library.clearEmpty}
                </button>
              )}
              <button className="btn-secondary" onClick={() => setAdding(true)}>
                {t.library.newSubject}
              </button>
            </div>
          </div>

          {adding && (
            <div className="mb-4">
              <SubjectForm
                initial={{ year: year === "none" ? null : year }}
                submitLabel={t.common.create}
                onCancel={() => setAdding(false)}
                onSubmit={async (data) => {
                  try {
                    const created = await api.post<Subject>("/subjects", data);
                    setSubjects((s) => [...(s ?? []), { ...created, document_count: 0 }]);
                    setAdding(false);
                    chooseYear(created.year ?? "none");
                  } catch (err) {
                    alert(errorMessage(err));
                  }
                }}
              />
            </div>
          )}

          {visible.length === 0 ? (
            <p className="card text-muted p-6 text-center">{t.library.noSubjectsYear}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((s) => (
                <li key={s.id} className="relative">
                  <Link
                    href={`/asignatura/${s.id}`}
                    className="card card-hover flex h-full flex-col gap-4 overflow-hidden p-0"
                  >
                    <span className={`h-1.5 w-full ${subjectLook(s).bar}`} aria-hidden="true" />
                    <div className="flex items-start gap-3 px-4 pr-12">
                      <GradientIcon icon={subjectLook(s).icon} tone={subjectLook(s).tone} />
                      <p className="font-display pt-2 leading-snug font-bold">{s.name}</p>
                    </div>
                    <div className="text-muted mt-auto flex items-center justify-between px-4 pb-4 text-sm">
                      <span>{s.area ? t.areas[s.area] : ""}</span>
                      <span className="bg-surface-2 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {t.library.files(s.document_count ?? 0)}
                      </span>
                    </div>
                  </Link>
                  <button
                    className="btn-ghost absolute top-4 right-2 px-2"
                    aria-label={t.library.deleteSubject(s.name)}
                    onClick={() => deleteSubject(s)}
                  >
                    <Trash size={18} weight="duotone" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-10">
        <Link href="/referencia" className="card card-hover flex items-center gap-4 p-5">
          <GradientIcon icon={GraduationCap} tone="teal" />
          <div>
            <p className="font-semibold">{t.reference.title}</p>
            <p className="text-muted text-sm">{t.reference.cardText}</p>
          </div>
        </Link>
      </section>
    </>
  );
}
