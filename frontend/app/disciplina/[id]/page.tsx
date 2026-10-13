"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { SubjectForm } from "@/components/SubjectForm";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { UploadZone } from "@/components/UploadZone";
import { api, errorMessage } from "@/lib/api";
import { AREA_LABELS, type DocumentItem, type Subject } from "@/lib/types";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<Subject[]>("/subjects"),
        api.get<DocumentItem[]>(`/documents?subject_id=${id}`),
      ]);
      setSubjects(s);
      setDocs(d);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    // O estado só muda depois do pedido (após o await), não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const subject = subjects.find((s) => s.id === id);
  const setDocsStable = useCallback(
    (fn: (d: DocumentItem[]) => DocumentItem[]) => setDocs((prev) => fn(prev ?? [])),
    [],
  );

  async function removeSubject() {
    if (!subject) return;
    if (!confirm(`Apagar a disciplina "${subject.name}"? Os ficheiros não são apagados: ficam “sem disciplina”.`))
      return;
    try {
      await api.del(`/subjects/${subject.id}`);
      router.push("/biblioteca");
    } catch (err) {
      alert(errorMessage(err));
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
  if (!docs) return <Spinner label="A carregar…" />;
  if (!subject) {
    return (
      <div className="card p-6">
        <p>Esta disciplina já não existe.</p>
        <Link href="/biblioteca" className="btn-primary mt-4">
          Voltar à Biblioteca
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/biblioteca" className="text-accent mb-3 inline-block text-sm font-medium">
        ← Biblioteca
      </Link>
      {editing ? (
        <div className="mb-6">
          <SubjectForm
            initial={subject}
            submitLabel="Guardar"
            onCancel={() => setEditing(false)}
            onSubmit={async (data) => {
              try {
                const updated = await api.patch<Subject>(`/subjects/${subject.id}`, data);
                setSubjects((list) => list.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
                setEditing(false);
              } catch (err) {
                alert(errorMessage(err));
              }
            }}
          />
        </div>
      ) : (
        <PageHeader
          title={subject.name}
          subtitle={[subject.year ? `${subject.year}.º ano` : null, subject.area ? AREA_LABELS[subject.area] : null]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <>
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                ✏️ Editar
              </button>
              <button className="btn-ghost" onClick={removeSubject}>
                🗑️ Apagar
              </button>
            </>
          }
        />
      )}

      <section className="mb-8">
        <UploadZone subjectId={subject.id} onUploaded={(doc) => setDocs((list) => [doc, ...(list ?? [])])} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Ficheiros</h2>
        <DocumentList
          docs={docs}
          setDocs={setDocsStable}
          subjects={subjects}
          emptyText="Ainda não tens ficheiros nesta disciplina. Arrasta para cima os apontamentos que recebeste por email."
        />
      </section>
    </>
  );
}
