"use client";

import { Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { DocumentItem, Subject } from "@/lib/types";
import { fileIcon, formatDate, StatusBadge } from "./ui";

/** Consulta el estado mientras haya archivos "Procesando…". */
export function usePollProcessing(docs: DocumentItem[], setDocs: (fn: (d: DocumentItem[]) => DocumentItem[]) => void) {
  const processingIds = docs
    .filter((d) => d.status === "processing")
    .map((d) => d.id)
    .join(",");
  useEffect(() => {
    if (!processingIds) return;
    const timer = setInterval(async () => {
      for (const id of processingIds.split(",")) {
        try {
          const updated = await api.get<DocumentItem>(`/documents/${id}`);
          if (updated.status !== "processing") setDocs((list) => list.map((d) => (d.id === id ? updated : d)));
        } catch {
          /* se vuelve a intentar en el siguiente ciclo */
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [processingIds, setDocs]);
}

/** Traduce los códigos de error del procesado que guarda el backend. */
export function useDocError() {
  const t = useT();
  return (message: string | null) => (message ? (t.docErrors[message] ?? message) : null);
}

export function DocumentList({
  docs,
  setDocs,
  subjects,
  emptyText,
  onAssigned,
}: {
  docs: DocumentItem[];
  setDocs: (fn: (d: DocumentItem[]) => DocumentItem[]) => void;
  subjects: Subject[];
  emptyText?: string;
  onAssigned?: (doc: DocumentItem) => void;
}) {
  const t = useT();
  const lang = useLang();
  const docError = useDocError();
  usePollProcessing(docs, setDocs);

  async function remove(doc: DocumentItem) {
    if (!confirm(t.docList.confirmDelete(doc.title))) return;
    try {
      await api.del(`/documents/${doc.id}`);
      setDocs((list) => list.filter((d) => d.id !== doc.id));
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function assign(doc: DocumentItem, subjectId: string | null) {
    try {
      const updated = await api.patch<DocumentItem>(`/documents/${doc.id}`, { subject_id: subjectId });
      if (onAssigned) onAssigned(updated);
      else setDocs((list) => list.map((d) => (d.id === doc.id ? updated : d)));
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  if (docs.length === 0) {
    return <p className="bg-surface-2 text-muted rounded-xl p-4 text-center">{emptyText ?? t.docList.empty}</p>;
  }

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name;

  return (
    <ul className="space-y-2">
      {docs.map((doc) => {
        const suggestion =
          !doc.subject_id && doc.suggested_subject_id ? subjectName(doc.suggested_subject_id) : undefined;
        return (
          <li key={doc.id} className="card p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl" aria-hidden="true">
                {fileIcon(doc.mime_type)}
              </span>
              <div className="min-w-0 flex-1">
                {doc.status === "ready" ? (
                  <Link
                    href={`/documento/${doc.id}${doc.source_type === "referencia" ? "#archivo" : ""}`}
                    className="hover:text-accent block font-semibold"
                  >
                    {doc.title}
                  </Link>
                ) : (
                  <p className="font-semibold">{doc.title}</p>
                )}
                <div className="text-muted mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={doc.status} />
                  {doc.source_type === "referencia" && (
                    <span className="bg-warning-soft rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {t.reference.badge(doc.reference_org ?? "IAEA / EFRS")}
                    </span>
                  )}
                  <span>{formatDate(doc.created_at, lang)}</span>
                  {doc.subject_id && subjectName(doc.subject_id) && <span>· {subjectName(doc.subject_id)}</span>}
                </div>
                {doc.status === "error" && doc.error_message && (
                  <p className="text-danger mt-2 text-sm">{docError(doc.error_message)}</p>
                )}
                {suggestion && (
                  <div className="bg-accent-soft mt-3 flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
                    <span>
                      {t.docList.suggestion} <strong>{suggestion}</strong>.
                    </span>
                    <button
                      className="btn-primary min-h-9 px-3 py-1 text-sm"
                      onClick={() => assign(doc, doc.suggested_subject_id)}
                    >
                      {t.docList.confirm}
                    </button>
                  </div>
                )}
                {!doc.subject_id && subjects.length > 0 && (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-muted">{t.docList.subject}</span>
                    <select
                      className="input min-h-9 min-w-0 flex-1 py-1 text-sm sm:max-w-xs"
                      value=""
                      onChange={(e) => e.target.value && assign(doc, e.target.value)}
                    >
                      <option value="">{t.docList.choose}</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.year ? `${t.docList.yearShort(s.year)} · ` : ""}
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <button
                className="btn-ghost px-3"
                onClick={() => remove(doc)}
                aria-label={t.docList.deleteLabel(doc.title)}
              >
                <Trash size={18} weight="duotone" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
