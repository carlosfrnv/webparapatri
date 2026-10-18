"use client";

import { ArrowsClockwise, Printer } from "@phosphor-icons/react";
import { Patrick_Hand } from "next/font/google";
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

// Estilo "mapa mental" dibujado a mano: tarjetas pastel con borde oscuro, números en círculos y flechas.
const hand = Patrick_Hand({ weight: "400", subsets: ["latin", "latin-ext"], display: "swap" });

const PALETTE = [
  { bg: "#fde68a", dot: "#facc15" },
  { bg: "#a5f3fc", dot: "#22d3ee" },
  { bg: "#d9f99d", dot: "#a3e635" },
  { bg: "#fed7aa", dot: "#fb923c" },
  { bg: "#fbcfe8", dot: "#f472b6" },
  { bg: "#c7d2fe", dot: "#818cf8" },
  { bg: "#ddd6fe", dot: "#a78bfa" },
  { bg: "#fecaca", dot: "#f87171" },
  { bg: "#bbf7d0", dot: "#4ade80" },
  { bg: "#f5e1c8", dot: "#d6a676" },
];

function Items({ nodes, depth = 1 }: { nodes: MindNode[]; depth?: number }) {
  return (
    <ul className={depth > 1 ? "mt-0.5 ml-3 space-y-0.5" : "mt-1.5 space-y-1"}>
      {nodes.map((n, i) => (
        <li key={i} className="text-[13px] leading-snug">
          <span className="font-semibold">
            {depth > 1 ? "· " : "• "}
            {n.label}
          </span>
          {n.note && <span className="opacity-80">: {n.note}</span>}
          {n.children && n.children.length > 0 && <Items nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function Badge({ n, color }: { n: number; color: string }) {
  return (
    <span
      className={`${hand.className} flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#2b2b2b] text-lg font-bold text-[#2b2b2b]`}
      style={{ background: color }}
    >
      {n}
    </span>
  );
}

/** Flecha curva dibujada a mano que sale del centro hacia la tarjeta. */
function Arrow({ side }: { side: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 60 30"
      className={`h-6 w-12 shrink-0 text-[#2b2b2b] ${side === "left" ? "-scale-x-100" : ""}`}
      aria-hidden="true"
    >
      <path d="M2 22 C 18 4, 36 4, 54 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M45 8 L55 14 L45 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BranchCard({ b, color }: { b: MindNode; color: string }) {
  return (
    <section
      className="print-avoid-break min-w-0 flex-1 rounded-md border-2 border-[#2b2b2b] px-4 py-3 text-[#1f1f1f] shadow-[3px_3px_0_#2b2b2b]"
      style={{ background: color }}
    >
      <h3 className={`${hand.className} text-center text-xl leading-tight`}>{b.label}</h3>
      {b.note && <p className="mt-0.5 text-center text-xs opacity-80">{b.note}</p>}
      {b.children && b.children.length > 0 && <Items nodes={b.children} />}
    </section>
  );
}

/**
 * El esquema dibujado como un mapa mental: el tema en el centro y las ramas numeradas a los dos lados,
 * con flechas. En pantallas estrechas, el tema arriba y las ramas una debajo de otra.
 */
export function MindMapView({ tree }: { tree: MindNode }) {
  const branches = (tree.children ?? []).map((b, i) => ({ b, i, color: PALETTE[i % PALETTE.length] }));
  const half = Math.ceil(branches.length / 2);
  const left = branches.slice(0, half);
  const right = branches.slice(half);
  // Letra más pequeña si el título tiene palabras largas (así no se parten).
  const longest = Math.max(...tree.label.split(/\s+/).map((w) => w.length));
  const titleSize = longest > 13 ? "text-2xl" : longest > 9 ? "text-3xl" : "text-4xl";
  const center = (
    <div className="flex flex-col items-center justify-center px-2 text-center">
      <svg viewBox="0 0 40 120" className="h-20 w-8" aria-hidden="true">
        <path
          d="M14 8 h12 v80 l-6 18 l-6 -18 z"
          fill="#fcd34d"
          stroke="#2b2b2b"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M14 8 h12 v10 h-12 z" fill="#f9a8d4" stroke="#2b2b2b" strokeWidth="2.5" />
        <path d="M17 99 l3 7 l3 -7" fill="#2b2b2b" />
        <path d="M6 112 q14 -8 28 0" fill="none" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className={`${hand.className} mt-2 max-w-full leading-none text-[#2b2b2b] uppercase ${titleSize}`}>
        {tree.label}
      </p>
    </div>
  );
  return (
    <div
      className="mindmap @container overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#fbfbfa] p-4 sm:p-6 print:border-0"
      style={{
        backgroundImage:
          "linear-gradient(#ececec 1px, transparent 1px), linear-gradient(90deg, #ececec 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      {/* Poco ancho (móvil, iPad, PDF): el tema arriba y las ramas debajo, en una o dos columnas */}
      <div className="@min-[52rem]:hidden">
        {center}
        <div className="mt-4 grid gap-4 @min-[30rem]:grid-cols-2">
          {branches.map(({ b, i, color }) => (
            <div key={i} className="flex items-start gap-2">
              <Badge n={i + 1} color={color.dot} />
              <BranchCard b={b} color={color.bg} />
            </div>
          ))}
        </div>
      </div>

      {/* iPad y ordenador: ramas a los dos lados del tema */}
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(10rem,15rem)_minmax(0,1fr)] items-center gap-2 @min-[52rem]:grid">
        <div className="flex flex-col gap-4">
          {left.map(({ b, i, color }) => (
            <div key={i} className="flex items-center gap-1">
              <BranchCard b={b} color={color.bg} />
              <Arrow side="left" />
              <Badge n={i + 1} color={color.dot} />
            </div>
          ))}
        </div>
        {center}
        <div className="flex flex-col gap-4">
          {right.map(({ b, i, color }) => (
            <div key={i} className="flex items-center gap-1">
              <Badge n={i + 1} color={color.dot} />
              <Arrow side="right" />
              <BranchCard b={b} color={color.bg} />
            </div>
          ))}
        </div>
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
