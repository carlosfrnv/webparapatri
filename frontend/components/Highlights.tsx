"use client";

import { NotePencil, Trash, X } from "@phosphor-icons/react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";

/**
 * Subrayar y apuntar en el resumen: al seleccionar un trozo de texto sale una barrita con colores y "Nota".
 * Lo subrayado se pinta con el resaltado nativo del navegador (CSS Custom Highlight API), sin tocar el
 * texto del resumen; abajo hay una lista con todo lo subrayado y sus notas.
 */

export type HighlightColor = "yellow" | "green" | "pink" | "blue";
export interface Highlight {
  id: string;
  document_id: string;
  quote: string;
  color: HighlightColor;
  note: string | null;
  created_at: string;
}

export const HL_COLORS: Record<HighlightColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  pink: "#f472b6",
  blue: "#60a5fa",
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Busca un texto dentro del contenedor aunque cruce varias etiquetas (negritas, listas…) y con espacios
 * distintos. Devuelve el trozo como Range del documento, o null si ya no está (p. ej., resumen regenerado).
 */
export function findRange(root: HTMLElement, quote: string): Range | null {
  const target = squash(quote);
  if (!target) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // Texto de todo el contenedor con los espacios juntos, y de dónde sale cada letra.
  let flat = "";
  const from: { node: Text; offset: number }[] = [];
  let lastSpace = true;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    // Las fórmulas (KaTeX) llevan una copia oculta en MathML: se salta.
    if (n.parentElement?.closest(".katex-mathml")) continue;
    const text = n.data;
    for (let i = 0; i < text.length; i++) {
      const space = /\s/.test(text[i]);
      if (space && lastSpace) continue;
      flat += space ? " " : text[i];
      from.push({ node: n, offset: i });
      lastSpace = space;
    }
    // Entre bloques (párrafos, puntos de lista) hay un salto aunque no haya espacio en el texto.
    if (!lastSpace && n.parentElement && getComputedStyle(n.parentElement).display !== "inline") {
      flat += " ";
      from.push({ node: n, offset: text.length });
      lastSpace = true;
    }
  }
  const at = flat.indexOf(target);
  if (at < 0) return null;
  const start = from[at];
  const end = from[at + target.length - 1];
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, Math.min(end.offset + 1, end.node.length));
  return range;
}

export function useHighlights(documentId: string) {
  const lang = useLang();
  const [items, setItems] = useState<Highlight[]>([]);
  useEffect(() => {
    api
      .get<Highlight[]>(`/highlights?document_id=${documentId}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [documentId, lang]);
  return [items, setItems] as const;
}

/** Pinta los subrayados en el contenedor (se repite si cambia el contenido, p. ej. al cargar las figuras). */
export function useHighlightPaint(root: RefObject<HTMLElement | null>, items: Highlight[], version: unknown) {
  useEffect(() => {
    const el = root.current;
    const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    if (!el || !registry || typeof Highlight === "undefined") return;
    const paint = () => {
      for (const c of Object.keys(HL_COLORS)) {
        const ranges = items
          .filter((h) => h.color === c)
          .map((h) => findRange(el, h.quote))
          .filter((r): r is Range => !!r);
        registry.set(`hl-${c}`, new Highlight(...ranges));
      }
    };
    paint();
    // Las figuras y fórmulas se cargan después: se vuelve a pintar cuando cambia el contenido.
    const observer = new MutationObserver(() => paint());
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const c of Object.keys(HL_COLORS)) registry.delete(`hl-${c}`);
    };
  }, [root, items, version]);
}

/** Barrita que aparece al seleccionar texto dentro del resumen, y la lista de subrayados y notas. */
export function HighlightTools({
  documentId,
  root,
  items,
  setItems,
}: {
  documentId: string;
  root: RefObject<HTMLElement | null>;
  items: Highlight[];
  setItems: (fn: (list: Highlight[]) => Highlight[]) => void;
}) {
  const t = useT();
  const th = t.highlights;
  const [bar, setBar] = useState<{ quote: string; top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<{ id?: string; quote: string; note: string; color: HighlightColor } | null>(
    null,
  );
  const [problem, setProblem] = useState("");
  const range = useRef<Range | null>(null);

  const place = useCallback(() => {
    const r = range.current;
    if (!r) return;
    const rect = r.getBoundingClientRect();
    setBar((b) =>
      b ? { ...b, top: Math.min(rect.bottom + 10, window.innerHeight - 70), left: rect.left + rect.width / 2 } : b,
    );
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sel = window.getSelection();
        const el = root.current;
        if (!sel || sel.isCollapsed || !el || sel.rangeCount === 0) return setBar(null);
        const r = sel.getRangeAt(0);
        if (!el.contains(r.commonAncestorContainer)) return setBar(null);
        const quote = squash(sel.toString());
        if (quote.length < 2) return setBar(null);
        range.current = r.cloneRange();
        const rect = r.getBoundingClientRect();
        setBar({
          quote,
          top: Math.min(rect.bottom + 10, window.innerHeight - 70),
          left: rect.left + rect.width / 2,
        });
      }, 250);
    };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", place);
    };
  }, [root, place]);

  async function save(quote: string, color: HighlightColor, note: string | null) {
    setProblem("");
    try {
      const h = await api.post<Highlight>("/highlights", { document_id: documentId, quote, color, note });
      setItems((list) => [...list, h]);
      window.getSelection()?.removeAllRanges();
      setBar(null);
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  async function update(id: string, patch: { note?: string | null; color?: HighlightColor }) {
    try {
      const h = await api.patch<Highlight>(`/highlights/${id}`, patch);
      setItems((list) => list.map((x) => (x.id === id ? h : x)));
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/highlights/${id}`);
      setItems((list) => list.filter((x) => x.id !== id));
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  function goTo(h: Highlight) {
    const el = root.current;
    const r = el && findRange(el, h.quote);
    if (!r) return;
    const rect = r.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: "smooth" });
  }

  // Sin esto, en el iPad tocar un botón de la barra quita la selección antes de guardarla.
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

  return (
    <>
      {bar && (
        <div
          className="no-print bg-surface border-border fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border p-1.5 shadow-lg"
          style={{ top: bar.top, left: Math.max(200, Math.min(bar.left, window.innerWidth - 200)) }}
          role="toolbar"
          aria-label={th.toolbar}
          onPointerDown={keep}
          onMouseDown={keep}
        >
          {(Object.keys(HL_COLORS) as HighlightColor[]).map((c) => (
            <button
              key={c}
              onClick={() => save(bar.quote, c, null)}
              className="h-9 w-9 rounded-full border-2 border-white shadow-sm"
              style={{ background: HL_COLORS[c] }}
              aria-label={th.colors[c]}
            />
          ))}
          <button
            className="btn-ghost min-h-9 px-3 text-sm"
            onClick={() => {
              setEditing({ quote: bar.quote, note: "", color: "yellow" });
              setBar(null);
            }}
          >
            <NotePencil size={18} weight="duotone" aria-hidden="true" /> {th.note}
          </button>
        </div>
      )}

      {editing && (
        <div className="no-print fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem]">
          <div className="card space-y-3 p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted line-clamp-3 text-sm italic">«{editing.quote}»</p>
              <button className="btn-ghost min-h-8 px-2" onClick={() => setEditing(null)} aria-label={t.common.close}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <textarea
              className="input min-h-24 w-full"
              autoFocus
              value={editing.note}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              placeholder={th.notePlaceholder}
            />
            <button
              className="btn-primary w-full"
              onClick={async () => {
                if (editing.id) await update(editing.id, { note: editing.note });
                else await save(editing.quote, editing.color, editing.note);
                setEditing(null);
              }}
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {problem && <p className="text-danger mt-3 text-sm">{problem}</p>}

      {items.length > 0 && (
        <section className="border-border mt-8 border-t pt-4">
          <h2 className="font-display text-lg font-bold">{th.title(items.length)}</h2>
          <ul className="mt-3 space-y-2">
            {items.map((h) => (
              <li
                key={h.id}
                className="bg-surface-2 rounded-xl border-l-4 p-3 text-sm"
                style={{ borderLeftColor: HL_COLORS[h.color] }}
              >
                <button className="line-clamp-3 text-left italic" onClick={() => goTo(h)}>
                  «{h.quote}»
                </button>
                {h.note && <p className="mt-1.5 font-medium">📝 {h.note}</p>}
                <div className="no-print mt-2 flex flex-wrap gap-1">
                  <button
                    className="btn-ghost min-h-8 px-2 text-xs"
                    onClick={() => setEditing({ id: h.id, quote: h.quote, note: h.note ?? "", color: h.color })}
                  >
                    <NotePencil size={14} aria-hidden="true" /> {h.note ? th.editNote : th.addNote}
                  </button>
                  <button className="btn-ghost text-danger min-h-8 px-2 text-xs" onClick={() => remove(h.id)}>
                    <Trash size={14} aria-hidden="true" /> {th.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
