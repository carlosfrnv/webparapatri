"use client";

import { ArrowsClockwise, Printer } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { ErrorBox, Spinner } from "./ui";

export interface MindNode {
  label: string;
  note?: string;
  children?: MindNode[];
}

// Un color por rama, para distinguirlas de un vistazo (también al imprimir).
const BRANCH_COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#a855f7", "#ef4444"];

function Items({ nodes, color, depth }: { nodes: MindNode[]; color: string; depth: number }) {
  return (
    <ul
      className={depth > 1 ? "mt-1 ml-3 space-y-1 border-l-2 pl-3" : "space-y-2"}
      style={{ borderColor: `${color}55` }}
    >
      {nodes.map((n, i) => (
        <li key={i} className="text-sm leading-snug">
          <span className={depth === 1 ? "font-semibold" : ""}>{n.label}</span>
          {n.note && <span className="text-muted"> — {n.note}</span>}
          {n.children && n.children.length > 0 && <Items nodes={n.children} color={color} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

/** El esquema dibujado: el tema en el centro arriba y cada rama en su tarjeta de color. */
export function MindMapView({ tree }: { tree: MindNode }) {
  return (
    <div className="mindmap">
      <div className="flex justify-center">
        <p className="bg-accent text-accent-contrast rounded-2xl px-6 py-3 text-center text-lg font-extrabold shadow-sm print:border-2 print:border-black print:bg-white print:text-black">
          {tree.label}
        </p>
      </div>
      <div className="mx-auto h-5 w-0.5 bg-[var(--border)]" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
        {(tree.children ?? []).map((b, i) => {
          const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
          return (
            <section
              key={i}
              className="card print-avoid-break overflow-hidden border-t-4 p-4"
              style={{ borderTopColor: color }}
            >
              <h3 className="font-display text-base font-bold" style={{ color }}>
                {b.label}
              </h3>
              {b.note && <p className="text-muted mt-0.5 text-xs">{b.note}</p>}
              {b.children && b.children.length > 0 && (
                <div className="mt-2">
                  <Items nodes={b.children} color={color} depth={1} />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Carga el esquema del archivo (la primera vez lo hace la IA y queda guardado). */
export function useMindMap(documentId: string, enabled = true) {
  const lang = useLang();
  const [tree, setTree] = useState<MindNode | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      try {
        setTree(await api.get<MindNode>(`/documents/${documentId}/mindmap${force ? "?force=1" : ""}`));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [documentId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (y al cambiar de idioma)
    if (enabled) load();
  }, [load, enabled, lang]);

  return { tree, error, loading, reload: () => load(true) };
}

export function MindMapTab({ documentId }: { documentId: string }) {
  const t = useT();
  const tm = t.mindmap;
  const { tree, error, loading, reload } = useMindMap(documentId);

  if (error) return <ErrorBox message={error} />;
  if (loading || !tree) return <Spinner label={tm.loading} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Link href={`/documento/${documentId}/imprimir?esquema=1`} className="btn-secondary min-h-10 text-sm">
          <Printer size={18} weight="duotone" aria-hidden="true" /> {tm.print}
        </Link>
        <button
          className="btn-ghost min-h-10 text-sm"
          onClick={() => {
            if (confirm(tm.confirmRedo)) reload();
          }}
        >
          <ArrowsClockwise size={18} weight="duotone" aria-hidden="true" /> {tm.redo}
        </button>
      </div>
      <MindMapView tree={tree} />
    </>
  );
}
