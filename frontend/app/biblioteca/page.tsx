"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { SubjectForm } from "@/components/SubjectForm";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { UploadZone } from "@/components/UploadZone";
import { api, errorMessage } from "@/lib/api";
import { AREA_LABELS, type DocumentItem, type Source, type Subject } from "@/lib/types";

const YEARS = [1, 2, 3, 4] as const;

function SearchBox() {
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
          placeholder="Procurar nos apontamentos (ex.: dose absorvida)"
          aria-label="Procurar nos apontamentos"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value) setResults(null);
          }}
        />
        <button className="btn-secondary shrink-0" disabled={loading}>
          {loading ? "…" : "🔍 Procurar"}
        </button>
      </form>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
      {results && (
        <div className="mt-3">
          {results.length === 0 ? (
            <p className="text-muted">Nada encontrado. Experimenta outras palavras, ou pergunta no Chat.</p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.chunk_id}>
                  <Link href={`/documento/${r.document_id}`} className="card hover:border-accent block p-3">
                    <p className="text-sm font-semibold">
                      {r.document_title}
                      {r.page ? <span className="text-muted font-normal"> · pág. {r.page}</span> : null}
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
    // O estado só muda depois do pedido (após o await), não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Quando um ficheiro sem disciplina é atribuído, sai desta lista e a contagem da disciplina sobe.
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
      /* ignora */
    }
  }

  const visible = (subjects ?? []).filter((s) => (year === "none" ? !s.year : s.year === year));
  const hasNoYear = (subjects ?? []).some((s) => !s.year);

  return (
    <>
      <PageHeader title="Biblioteca" subtitle="Os teus apontamentos, por ano e disciplina." />

      <SearchBox />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Carregar ficheiros</h2>
        <UploadZone subjectId={null} onUploaded={(doc) => setUnassigned((list) => [doc, ...list])} />
        <p className="text-muted mt-2 text-sm">
          Dica: se carregares dentro de uma disciplina, o ficheiro fica logo lá. Daqui, a IA sugere onde o guardar.
        </p>
      </section>

      {unassigned.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Ficheiros sem disciplina</h2>
          <DocumentList docs={unassigned} setDocs={setUnassigned} onAssigned={onAssigned} subjects={subjects ?? []} />
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
      {!subjects && !error && <Spinner label="A carregar as disciplinas…" />}

      {subjects && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="bg-surface-2 flex gap-1 overflow-x-auto rounded-xl p-1" role="tablist" aria-label="Ano">
              {YEARS.map((y) => (
                <button
                  key={y}
                  role="tab"
                  aria-selected={year === y}
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium whitespace-nowrap ${year === y ? "bg-surface text-text shadow-sm" : "text-muted"}`}
                  onClick={() => chooseYear(y)}
                >
                  {y}.º ano
                </button>
              ))}
              {hasNoYear && (
                <button
                  role="tab"
                  aria-selected={year === "none"}
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium whitespace-nowrap ${year === "none" ? "bg-surface text-text shadow-sm" : "text-muted"}`}
                  onClick={() => chooseYear("none")}
                >
                  Outras
                </button>
              )}
            </div>
            <button className="btn-secondary" onClick={() => setAdding(true)}>
              + Nova disciplina
            </button>
          </div>

          {adding && (
            <div className="mb-4">
              <SubjectForm
                initial={{ year: year === "none" ? null : year }}
                submitLabel="Criar"
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
            <p className="card text-muted p-6 text-center">Ainda não há disciplinas neste ano.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/disciplina/${s.id}`}
                    className="card hover:border-accent flex h-full flex-col justify-between gap-3 p-4"
                  >
                    <p className="font-semibold">{s.name}</p>
                    <div className="text-muted flex items-center justify-between text-sm">
                      <span>{s.area ? AREA_LABELS[s.area] : ""}</span>
                      <span>
                        {s.document_count ?? 0} {s.document_count === 1 ? "ficheiro" : "ficheiros"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
