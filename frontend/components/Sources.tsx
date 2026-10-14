"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { isWebSource, type AnySource, type Source, type WebSource } from "@/lib/types";

/** Dirección interna de un fragmento local: abre el documento dentro de la propia web. */
export function localSourceHref(s: Source) {
  return s.kind === "referencia" ? `/documento/${s.document_id}#archivo` : `/documento/${s.document_id}`;
}

function WebChip({ s }: { s: WebSource }) {
  const t = useT();
  return (
    // El chip no saca a la estudiante de la web: la explicación está en la respuesta.
    // Solo un icono discreto abre el original, en una pestaña nueva.
    <span
      className="border-border bg-surface inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
      title={s.url}
    >
      <span aria-hidden="true">🌐</span>
      <span className="truncate">
        <strong className="font-semibold">{s.site}</strong> – {s.title}
      </span>
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-muted hover:text-accent ml-0.5 text-[11px]"
        aria-label={t.sources.openOriginal(s.site)}
        title={t.sources.openOriginal(s.site)}
      >
        ↗
      </a>
    </span>
  );
}

function LocalChip({ s }: { s: Source }) {
  const t = useT();
  const isRef = s.kind === "referencia";
  return (
    <Link
      href={localSourceHref(s)}
      title={s.excerpt}
      className={`hover:border-accent inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border px-3 py-1 text-xs ${
        isRef ? "border-border bg-warning-soft" : "border-border bg-surface"
      }`}
    >
      <span className="text-accent font-semibold">[{s.n}]</span>
      {isRef && <span className="font-semibold">{t.reference.badge(s.org ?? "IAEA / EFRS")} ·</span>}
      <span className="truncate">
        {s.document_title}
        {s.page ? `, ${t.chat.pageShort} ${s.page}` : ""}
      </span>
    </Link>
  );
}

export function SourceChips({ sources, title }: { sources: AnySource[]; title?: string }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      {title && <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">{title}</p>}
      <div className="flex flex-wrap gap-2">
        {sources.map((s) =>
          isWebSource(s) ? <WebChip key={s.url} s={s} /> : <LocalChip key={`${s.kind}-${s.n}`} s={s} />,
        )}
      </div>
    </div>
  );
}

// ---------- Sellos de origen dentro del texto ----------

type Origin = "notes" | "reference" | "web" | "general";

const ORIGIN_STYLE: Record<Origin, string> = {
  notes: "bg-success-soft text-success",
  reference: "bg-warning-soft text-text",
  web: "bg-accent-soft text-accent",
  general: "bg-surface-2 text-muted",
};

const LABEL_RE =
  /\[(Os teus apontamentos|Tus apuntes|Biblioteca de refer[eê]ncia\s*[–—-]\s*(?:IAEA|EFRS)(?:\s*\/\s*(?:IAEA|EFRS))?|Radiopaedia|IAEA|EFRS)\](?!\()/g;
const GENERAL_RE = /(?:\*\*)?(Fora dos teus apontamentos|Fuera de tus apuntes):(?:\*\*)?/g;

function originOf(label: string): Origin {
  if (/apontamentos|apuntes/.test(label)) return "notes";
  if (/^Biblioteca/.test(label)) return "reference";
  return "web";
}

/** Convierte las etiquetas en enlaces especiales (#origen-…) que el Markdown pinta como sellos. */
export function markOrigins(markdown: string): string {
  return markdown
    .replace(LABEL_RE, (_m, label: string) => `[${label}](#origen-${originOf(label)})`)
    .replace(GENERAL_RE, (_m, label: string) => `[${label}](#origen-general)`);
}

export function OriginBadge({ href, children }: { href: string; children: React.ReactNode }) {
  const origin = href.replace("#origen-", "") as Origin;
  return (
    <span
      className={`mr-1 inline-block rounded-md px-1.5 py-0.5 align-[1px] text-[0.78em] font-semibold whitespace-nowrap ${
        ORIGIN_STYLE[origin] ?? ORIGIN_STYLE.general
      }`}
    >
      {children}
      {origin === "general" ? ":" : ""}
    </span>
  );
}
