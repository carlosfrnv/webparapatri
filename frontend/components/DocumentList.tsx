"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  DotsSixVertical,
  PencilSimple,
  SortAscending,
  Trash,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  reorderable = false,
}: {
  docs: DocumentItem[];
  setDocs: (fn: (d: DocumentItem[]) => DocumentItem[]) => void;
  subjects: Subject[];
  emptyText?: string;
  onAssigned?: (doc: DocumentItem) => void;
  /** Permite cambiar el orden (flechas, arrastrar y "ordenar por nombre"). */
  reorderable?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const docError = useDocError();
  usePollProcessing(docs, setDocs);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  async function rename() {
    if (!editing) return;
    const title = editing.title.trim();
    const doc = docs.find((d) => d.id === editing.id);
    setEditing(null);
    if (!doc || !title || title === doc.title) return;
    setDocs((list) => list.map((d) => (d.id === doc.id ? { ...d, title } : d)));
    try {
      await api.patch(`/documents/${doc.id}`, { title });
    } catch (err) {
      setDocs((list) => list.map((d) => (d.id === doc.id ? { ...d, title: doc.title } : d)));
      alert(errorMessage(err));
    }
  }

  /** Aplica un orden nuevo en pantalla y lo guarda. */
  async function saveOrder(next: DocumentItem[]) {
    setDocs(() => next);
    try {
      await api.post("/documents/reorder", { ids: next.map((d) => d.id) });
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= docs.length) return;
    const next = [...docs];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = docs.filter((d) => d.id !== dragId);
    const dragged = docs.find((d) => d.id === dragId)!;
    next.splice(
      next.findIndex((d) => d.id === targetId) +
        (docs.findIndex((d) => d.id === dragId) < docs.findIndex((d) => d.id === targetId) ? 1 : 0),
      0,
      dragged,
    );
    setDragId(null);
    saveOrder(next);
  }

  function sortByName() {
    // Orden "natural": Tema 2 va antes que Tema 10.
    const collator = new Intl.Collator(lang === "pt" ? "pt-PT" : "es-ES", { numeric: true, sensitivity: "base" });
    saveOrder([...docs].sort((a, b) => collator.compare(a.title, b.title)));
  }

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
    <div>
      {reorderable && docs.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs">{t.docList.orderHint}</p>
          <button className="btn-ghost min-h-9 px-3 text-sm" onClick={sortByName}>
            <SortAscending size={18} weight="duotone" aria-hidden="true" /> {t.docList.sortByName}
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {docs.map((doc, index) => {
          const suggestion =
            !doc.subject_id && doc.suggested_subject_id ? subjectName(doc.suggested_subject_id) : undefined;
          const isEditing = editing?.id === doc.id;
          return (
            <li
              key={doc.id}
              className={`card p-3 transition-opacity sm:p-4 ${dragId === doc.id ? "opacity-50" : ""}`}
              draggable={reorderable && !isEditing}
              onDragStart={(e) => {
                setDragId(doc.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => reorderable && dragId && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(doc.id);
              }}
              onDragEnd={() => setDragId(null)}
            >
              <div className="flex items-start gap-3">
                {reorderable && (
                  <span className="text-muted mt-1 hidden cursor-grab sm:block" aria-hidden="true">
                    <DotsSixVertical size={20} weight="bold" />
                  </span>
                )}
                <span className="mt-0.5 text-2xl" aria-hidden="true">
                  {fileIcon(doc.mime_type)}
                </span>
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename();
                      }}
                    >
                      <input
                        className="input min-h-9 min-w-0 flex-1 py-1"
                        value={editing.title}
                        maxLength={200}
                        autoFocus
                        aria-label={t.docList.renameLabel(doc.title)}
                        onChange={(e) => setEditing({ id: doc.id, title: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      />
                      <button className="btn-primary min-h-9 px-2.5" aria-label={t.common.save}>
                        <Check size={18} weight="bold" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost min-h-9 px-2.5"
                        onClick={() => setEditing(null)}
                        aria-label={t.common.cancel}
                      >
                        <X size={18} weight="bold" aria-hidden="true" />
                      </button>
                    </form>
                  ) : doc.status === "ready" ? (
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
                <div className="flex shrink-0 flex-wrap items-center justify-end">
                  {reorderable && (
                    <>
                      <button
                        className="btn-ghost min-h-9 px-2"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={t.docList.moveUp(doc.title)}
                      >
                        <ArrowUp size={16} weight="bold" aria-hidden="true" />
                      </button>
                      <button
                        className="btn-ghost min-h-9 px-2"
                        onClick={() => move(index, 1)}
                        disabled={index === docs.length - 1}
                        aria-label={t.docList.moveDown(doc.title)}
                      >
                        <ArrowDown size={16} weight="bold" aria-hidden="true" />
                      </button>
                    </>
                  )}
                  <button
                    className="btn-ghost min-h-9 px-2"
                    onClick={() => setEditing({ id: doc.id, title: doc.title })}
                    aria-label={t.docList.renameLabel(doc.title)}
                  >
                    <PencilSimple size={18} weight="duotone" aria-hidden="true" />
                  </button>
                  <button
                    className="btn-ghost min-h-9 px-2"
                    onClick={() => remove(doc)}
                    aria-label={t.docList.deleteLabel(doc.title)}
                  >
                    <Trash size={18} weight="duotone" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
