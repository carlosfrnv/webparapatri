"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { UploadZone } from "@/components/UploadZone";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { DocumentItem, ReferenceOrg } from "@/lib/types";

/** Biblioteca de referência (IAEA / EFRS): separada dos apontamentos, usada só na pesquisa. */
export default function ReferencePage() {
  const t = useT();
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [org, setOrg] = useState<ReferenceOrg>("IAEA");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setDocs(await api.get<DocumentItem[]>("/documents?source_type=referencia"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // O estado só muda depois do pedido (após o await), não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const setDocsStable = useCallback(
    (fn: (d: DocumentItem[]) => DocumentItem[]) => setDocs((prev) => fn(prev ?? [])),
    [],
  );

  return (
    <>
      <Link href="/biblioteca" className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.nav.library}
      </Link>
      <PageHeader title={`📚 ${t.reference.title}`} subtitle={t.reference.subtitle} />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t.reference.upload}</h2>
          <div className="bg-surface-2 flex gap-1 rounded-xl p-1" role="group" aria-label={t.reference.org}>
            {(["IAEA", "EFRS"] as const).map((o) => (
              <button
                key={o}
                aria-pressed={org === o}
                onClick={() => setOrg(o)}
                className={`min-h-9 rounded-lg px-4 text-sm font-medium ${
                  org === o ? "bg-surface text-text shadow-sm" : "text-muted"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <UploadZone
          subjectId={null}
          fields={{ sourceType: "referencia", referenceOrg: org }}
          title={t.reference.dropTitle(org)}
          onUploaded={(doc) => setDocs((list) => [doc, ...(list ?? [])])}
        />
      </section>

      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!docs && !error && <Spinner label={t.common.loading} />}
      {docs && <DocumentList docs={docs} setDocs={setDocsStable} subjects={[]} emptyText={t.reference.empty} />}
    </>
  );
}
