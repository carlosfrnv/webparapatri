"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { dateLocale, type Lang, useT } from "@/lib/i18n";
import type { DocumentItem } from "@/lib/types";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="text-muted flex items-center gap-3" role="status">
      <span className="border-border border-t-accent h-5 w-5 animate-spin rounded-full border-2" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="bg-danger-soft flex flex-wrap items-center justify-between gap-3 rounded-xl p-4" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          {t.common.retry}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="text-4xl" aria-hidden="true">
        {icon}
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="text-muted max-w-md">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: DocumentItem["status"] }) {
  const t = useT();
  if (status === "ready")
    return (
      <span className="bg-success-soft text-success rounded-full px-2.5 py-0.5 text-xs font-medium">
        {t.status.ready}
      </span>
    );
  if (status === "error")
    return (
      <span className="bg-danger-soft text-danger rounded-full px-2.5 py-0.5 text-xs font-medium">
        {t.status.error}
      </span>
    );
  return (
    <span className="bg-accent-soft text-accent inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
      <span className="bg-accent h-2 w-2 animate-pulse rounded-full" aria-hidden="true" />
      {t.status.processing}
    </span>
  );
}

/** Markdown com links internos para as citações [n]. */
export function Markdown({ children, citeHref }: { children: string; citeHref?: (n: number) => string | undefined }) {
  const text = citeHref
    ? children.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => {
        const href = citeHref(Number(n));
        return href ? `[\\[${n}\\]](${href})` : m;
      })
    : children;
  return (
    <div className="prose-study">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("/") ? (
              <Link href={href} className="text-accent font-medium no-underline">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function fileIcon(mime: string | null): string {
  if (!mime) return "📄";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("presentation")) return "📙";
  if (mime.includes("word")) return "📘";
  return "📄";
}

export function formatDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" });
}
