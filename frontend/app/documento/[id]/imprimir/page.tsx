"use client";

import { Printer } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Markdown, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { DocumentItem, StudyMaterials, Subject } from "@/lib/types";

type Part = "summary" | "concepts" | "glossary" | "flashcards";

/**
 * Versión para imprimir o guardar en PDF del material de un archivo. Usa la impresión del navegador
 * (en el iPad: Compartir/Imprimir → guardar en Archivos), así que no gasta nada ni necesita servidor.
 */
export default function PrintPage() {
  const t = useT();
  const tp = t.print;
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [materials, setMaterials] = useState<StudyMaterials | null>(null);
  const [error, setError] = useState("");
  const [parts, setParts] = useState<Record<Part, boolean>>({
    summary: true,
    concepts: true,
    glossary: true,
    flashcards: false,
  });

  useEffect(() => {
    Promise.all([
      api.get<DocumentItem>(`/documents/${id}`),
      api.get<StudyMaterials>(`/documents/${id}/study`),
      api.get<Subject[]>("/subjects").catch(() => [] as Subject[]),
    ])
      .then(([d, m, subjects]) => {
        setDoc(d);
        setMaterials(m);
        setSubject(subjects.find((s) => s.id === d.subject_id)?.name ?? null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id, lang]);

  if (error) return <ErrorBox message={error} />;
  if (!doc || !materials) return <Spinner label={t.common.loading} />;

  const today = new Date().toLocaleDateString(dateLocale(lang), { day: "numeric", month: "long", year: "numeric" });
  const glossary = [...materials.glossary].sort((a, b) => a.term.localeCompare(b.term, lang));

  return (
    <>
      {/* Opciones (no salen en el PDF) */}
      <div className="no-print mb-6 space-y-4">
        <Link href={`/documento/${id}`} className="text-accent inline-block text-sm font-medium">
          ← {t.common.back}
        </Link>
        <div className="card space-y-4 p-5">
          <p className="font-semibold">{tp.choose}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(parts) as Part[]).map((p) => (
              <label
                key={p}
                className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-sm font-medium ${
                  parts[p] ? "border-accent bg-accent-soft text-accent" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={parts[p]}
                  onChange={(e) => setParts((x) => ({ ...x, [p]: e.target.checked }))}
                />
                {parts[p] ? "✓ " : ""}
                {tp.parts[p]}
              </label>
            ))}
          </div>
          <button className="btn-primary" onClick={() => window.print()} disabled={!Object.values(parts).some(Boolean)}>
            <Printer size={18} weight="duotone" aria-hidden="true" /> {tp.print}
          </button>
          <p className="text-muted text-xs">{tp.howTo}</p>
        </div>
        <p className="text-muted text-sm">{tp.preview}</p>
      </div>

      {/* Documento */}
      <article className="card print-doc mx-auto max-w-3xl p-6 sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-border mb-6 border-b pb-4">
          <p className="text-muted text-xs font-semibold tracking-wider uppercase">
            {[subject, t.appName].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">{doc.title}</h1>
        </header>

        {parts.summary && (
          <section className="mb-8">
            <Markdown>{materials.summary}</Markdown>
          </section>
        )}

        {parts.concepts && materials.key_concepts.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-bold">{tp.parts.concepts}</h2>
            <ol className="space-y-3">
              {materials.key_concepts.map((c, i) => (
                <li key={i} className="print-avoid-break">
                  <p className="font-semibold">
                    {i + 1}. {c.concept}
                  </p>
                  <p className="mt-0.5">{c.explanation}</p>
                  <p className="text-muted mt-0.5 text-sm">
                    <strong>{t.document.whyItMatters}</strong> {c.why_it_matters}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {parts.glossary && glossary.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-bold">{tp.parts.glossary}</h2>
            <dl className="divide-border divide-y text-sm">
              {glossary.map((g, i) => (
                <div key={i} className="print-avoid-break grid grid-cols-3 gap-3 py-1.5">
                  <dt className="font-semibold">{g.term}</dt>
                  <dd className="col-span-2">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {parts.flashcards && materials.flashcards.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-bold">{tp.parts.flashcards}</h2>
            <ol className="space-y-2 text-sm">
              {materials.flashcards.map((f, i) => (
                <li key={i} className="print-avoid-break border-border rounded-lg border p-3">
                  <p className="font-semibold">
                    {i + 1}. {f.front}
                  </p>
                  <p className="text-muted mt-1">→ {f.back}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="border-border text-muted border-t pt-3 text-xs">{tp.footer(today)}</footer>
      </article>
    </>
  );
}
