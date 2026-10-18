"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { Markdown } from "./ui";

/**
 * Figuras de sus apuntes dentro del resumen. Cada figura se pone debajo del apartado que habla de lo mismo
 * (comparando las palabras de su descripción con las del apartado, sin usar la IA); las que no encajan
 * en ninguno van al final. Las figuras son las que se guardaron al "leer las imágenes" del archivo.
 */

export interface FigureImage {
  n: number;
  page: number | null;
  label: string;
  description: string;
  /** Texto para colocarla en su apartado (descripción completa, en los dos idiomas). */
  match?: string;
  /** Etiquetas de la imagen (en portugués) con su traducción, para la leyenda. */
  labels?: { pt: string; es: string }[];
  url: string;
}

const STOP = new Set(
  "figura figuras imagen imagenes imagem imagens muestra mostra muestran mostram esquema donde onde entre sobre para como este esta estos estas esse essa esses essas isto cada tambien tambem pode puede pueden podem mais menos seus suas dela dele cuando quando tiene tem tienen tiene sendo siendo segun segundo partir desde hasta outro otra outra otro todo toda todos todas parte partes".split(
    " ",
  ),
);

/** Palabras con significado (sin tildes ni palabras vacías), reducidas a su raíz. */
function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      // Raíz de 4 letras: así coinciden el portugués y el español (costelas/costillas, coluna/columna, esterno/esternón).
      .map((w) => (w.length >= 5 ? w.slice(0, 4) : w)),
  );
}

/** Divide el resumen por apartados (títulos ## y ###). */
function sectionsOf(markdown: string) {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of markdown.split("\n")) {
    if (/^#{2,3}\s/.test(line) && current.join("").trim()) {
      out.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.join("").trim()) out.push(current.join("\n"));
  return out;
}

export function placeFigures(markdown: string, figures: FigureImage[]) {
  const sections = sectionsOf(markdown);
  const info = sections.map((s) => ({ all: words(s), heading: words(s.split("\n")[0]) }));
  const placed: FigureImage[][] = sections.map(() => []);
  const rest: FigureImage[] = [];
  for (const f of figures) {
    const label = words(f.label);
    const desc = words(f.match ?? `${f.label} ${f.description}`);
    let best = -1;
    let bestScore = 0;
    info.forEach((sec, i) => {
      let score = 0;
      for (const w of desc) if (sec.all.has(w)) score += label.has(w) ? 2 : 1;
      for (const w of label) if (sec.heading.has(w)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    // Con muy poco en común no se arriesga: va a la galería del final.
    if (best >= 0 && bestScore >= 3) placed[best].push(f);
    else rest.push(f);
  }
  return { sections, placed, rest };
}

export function useFigureImages(documentId: string, version = 0) {
  const lang = useLang();
  const [figures, setFigures] = useState<FigureImage[]>([]);
  useEffect(() => {
    api
      .get<{ figures: FigureImage[] }>(`/documents/${documentId}/figure-images`)
      .then((r) => setFigures(r.figures))
      .catch(() => setFigures([]));
  }, [documentId, version, lang]);
  return figures;
}

function FigureCard({ f }: { f: FigureImage }) {
  const t = useT();
  // La etiqueta suele ser solo "página 11" o "diapositivo 3": entonces basta con la página.
  const generic = /^(p[aá]gina|diapositivo|imagem)\s*\d*$/i.test(f.label.trim());
  const caption = [generic ? null : f.label, f.page ? t.document.figurePage(f.page) : null].filter(Boolean).join(" · ");
  return (
    <figure className="print-avoid-break my-5">
      <a href={f.url} target="_blank" rel="noreferrer" aria-label={t.quiz.zoom}>
        {/* eslint-disable-next-line @next/next/no-img-element -- figura privada con enlace temporal */}
        <img
          src={f.url}
          alt={f.description || f.label}
          className="border-border mx-auto max-h-[24rem] w-auto rounded-xl border bg-white object-contain print:max-h-[9cm]"
        />
      </a>
      <figcaption className="text-muted mx-auto mt-1.5 max-w-xl text-center text-xs leading-snug">
        {caption && <span className="font-semibold">{caption}</span>}
        {f.labels && f.labels.length > 0 && (
          <span className="mt-2 flex flex-wrap justify-center gap-1.5">
            {f.labels.map((l, i) => (
              <span key={i} className="bg-surface-2 text-text rounded-full px-2.5 py-0.5">
                <span className="text-muted">{l.pt}</span> → <strong>{l.es}</strong>
              </span>
            ))}
          </span>
        )}
        {/* La descripción que escribió la IA al mirarla: plegada para no llenar el resumen de texto. */}
        {f.description && (
          <details className="no-print mt-1">
            <summary className="text-accent cursor-pointer">{t.document.figureWhat}</summary>
            <p className="mt-1 text-left">{f.description}</p>
          </details>
        )}
      </figcaption>
    </figure>
  );
}

/** El resumen con sus figuras intercaladas (o el resumen tal cual si no hay figuras). */
export function SummaryWithFigures({ markdown, figures }: { markdown: string; figures: FigureImage[] }) {
  const t = useT();
  if (figures.length === 0) return <Markdown>{markdown}</Markdown>;
  const { sections, placed, rest } = placeFigures(markdown, figures);
  return (
    <>
      {sections.map((s, i) => (
        <div key={i}>
          <Markdown>{s}</Markdown>
          {placed[i].map((f) => (
            <FigureCard key={f.n} f={f} />
          ))}
        </div>
      ))}
      {rest.length > 0 && (
        <section className="border-border mt-8 border-t pt-4">
          <h2 className="font-display text-xl font-bold">{t.document.moreFigures}</h2>
          <div className="grid gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            {rest.map((f) => (
              <FigureCard key={f.n} f={f} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
