"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
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
  url: string;
}

const STOP = new Set(
  "figura figuras imagen imagenes imagem imagens muestra mostra muestran mostram esquema donde onde entre sobre para como este esta estos estas esse essa esses essas isto cada tambien tambem pode puede pueden podem mais menos seus suas dela dele cuando quando tiene tem tienen tiene sendo siendo segun segundo partir desde hasta outro otra outra otro todo toda todos todas parte partes".split(
    " ",
  ),
);

/** Palabras con significado (sin tildes, sin plural sencillo y sin palabras vacías). */
function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w)),
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
    const desc = words(`${f.label} ${f.description}`);
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
  const [figures, setFigures] = useState<FigureImage[]>([]);
  useEffect(() => {
    api
      .get<{ figures: FigureImage[] }>(`/documents/${documentId}/figure-images`)
      .then((r) => setFigures(r.figures))
      .catch(() => setFigures([]));
  }, [documentId, version]);
  return figures;
}

function FigureCard({ f }: { f: FigureImage }) {
  const t = useT();
  const caption = f.page ? `${f.label} · ${t.document.figurePage(f.page)}` : f.label;
  return (
    <figure className="print-avoid-break my-5">
      <a href={f.url} target="_blank" rel="noreferrer" aria-label={t.quiz.zoom}>
        {/* eslint-disable-next-line @next/next/no-img-element -- figura privada con enlace temporal */}
        <img
          src={f.url}
          alt={f.label}
          className="border-border mx-auto max-h-[24rem] w-auto rounded-xl border bg-white object-contain print:max-h-[9cm]"
        />
      </a>
      <figcaption className="text-muted mx-auto mt-2 max-w-xl text-center text-xs leading-snug">
        <span className="text-text font-semibold">{caption}</span>
        {f.description && <span className="block">{f.description}</span>}
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
