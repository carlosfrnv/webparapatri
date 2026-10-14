"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { SubjectForm } from "@/components/SubjectForm";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { UploadZone } from "@/components/UploadZone";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { DocumentItem, Subject } from "@/lib/types";

export default function SubjectPage() {
  const t = useT();
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
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
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
    if (!confirm(t.subject.confirmDelete(subject.name))) return;
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
  if (!docs) return <Spinner label={t.common.loading} />;
  if (!subject) {
    return (
      <div className="card p-6">
        <p>{t.subject.gone}</p>
        <Link href="/biblioteca" className="btn-primary mt-4">
          {t.subject.backToLibrary}
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/biblioteca" className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.nav.library}
      </Link>
      {editing ? (
        <div className="mb-6">
          <SubjectForm
            initial={subject}
            submitLabel={t.common.save}
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
          subtitle={[subject.year ? t.library.yearN(subject.year) : null, subject.area ? t.areas[subject.area] : null]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <>
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                ✏️ {t.common.edit}
              </button>
              <button className="btn-ghost" onClick={removeSubject}>
                🗑️ {t.common.delete}
              </button>
            </>
          }
        />
      )}

      <section className="mb-8">
        <UploadZone subjectId={subject.id} onUploaded={(doc) => setDocs((list) => [doc, ...(list ?? [])])} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.subject.files}</h2>
        <DocumentList docs={docs} setDocs={setDocsStable} subjects={subjects} emptyText={t.subject.empty} />
      </section>
    </>
  );
}
