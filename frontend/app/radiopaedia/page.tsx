"use client";

import { ArrowLeft, ArrowSquareOut, Books, ClockCounterClockwise, MagnifyingGlass, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBox, Markdown, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import type { WebSource } from "@/lib/types";

/**
 * Radiopaedia dentro de la web: busca un tema y sale una ficha en su idioma hecha a partir de Radiopaedia, con el enlace
 * al artículo original (con sus imágenes de casos). El historial y los favoritos se guardan en este dispositivo.
 */

interface Entry {
  title: string;
  en: string;
  body: string;
  sources: WebSource[];
  search_url: string;
  from_radiopaedia: boolean;
}

const TEXT = {
  es: {
    title: "Radiopaedia",
    subtitle:
      "Busca cualquier tema de radiología: te lo explico en español a partir de Radiopaedia, con el artículo original a un toque.",
    search: "Neumotórax, signo de la silueta, fractura de Colles…",
    go: "Buscar",
    loading: "Buscando en Radiopaedia…",
    open: "Ver artículo e imágenes en Radiopaedia",
    searchThere: "Buscarlo en Radiopaedia",
    save: "Guardar",
    saved: "Guardado",
    source: "Fuente: Radiopaedia.org",
    noSource:
      "Esta vez no se ha podido consultar Radiopaedia: la ficha está hecha con conocimientos generales. Ábrelo en Radiopaedia para comprobarlo.",
    history: "Buscado hace poco",
    favorites: "Guardados",
    suggestions: [
      "Neumotórax",
      "Signo de la silueta",
      "Fractura de Colles",
      "Derrame pleural",
      "Ictus isquémico",
      "Apendicitis",
    ],
    back: "Estudiar",
  },
  pt: {
    title: "Radiopaedia",
    subtitle:
      "Procura qualquer tema de radiologia: explico-te em português a partir da Radiopaedia, com o artigo original à distância de um toque.",
    search: "Pneumotórax, sinal da silhueta, fratura de Colles…",
    go: "Procurar",
    loading: "A procurar na Radiopaedia…",
    open: "Ver artigo e imagens na Radiopaedia",
    searchThere: "Procurar na Radiopaedia",
    save: "Guardar",
    saved: "Guardado",
    source: "Fonte: Radiopaedia.org",
    noSource:
      "Desta vez não foi possível consultar a Radiopaedia: a ficha foi feita com conhecimentos gerais. Abre-a na Radiopaedia para confirmar.",
    history: "Procurado há pouco",
    favorites: "Guardados",
    suggestions: [
      "Pneumotórax",
      "Sinal da silhueta",
      "Fratura de Colles",
      "Derrame pleural",
      "AVC isquémico",
      "Apendicite",
    ],
    back: "Estudar",
  },
};

const read = (key: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const write = (key: string, list: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* sin almacenamiento */
  }
};

export default function RadiopaediaPage() {
  const lang = useLang();
  const tx = TEXT[lang];
  const [q, setQ] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    // Solo se lee del almacenamiento del navegador al abrir la página.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(read("rp-history"));
    setFavorites(read("rp-favorites"));
  }, []);

  async function search(term: string) {
    const t = term.trim();
    if (t.length < 2) return;
    setQ(t);
    setBusy(true);
    setError("");
    setEntry(null);
    try {
      const e = await api.post<Entry>("/encyclopedia", { q: t, lang });
      setEntry(e);
      const h = [t, ...history.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 12);
      setHistory(h);
      write("rp-history", h);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isFav = !!entry && favorites.some((f) => f.toLowerCase() === q.toLowerCase());
  function toggleFav() {
    const f = isFav ? favorites.filter((x) => x.toLowerCase() !== q.toLowerCase()) : [q, ...favorites].slice(0, 50);
    setFavorites(f);
    write("rp-favorites", f);
  }

  const chips = (list: string[]) => (
    <div className="flex flex-wrap gap-2">
      {list.map((s) => (
        <button
          key={s}
          className="bg-surface-2 hover:bg-accent-soft rounded-full px-3 py-1.5 text-sm"
          onClick={() => search(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <Link href="/estudiar" className="text-accent mb-4 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft size={18} aria-hidden="true" /> {tx.back}
      </Link>
      <PageHeader icon={Books} title={tx.title} subtitle={tx.subtitle} />

      <form
        className="card mb-4 flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="text-muted absolute top-1/2 left-3 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            className="input pl-10"
            value={q}
            placeholder={tx.search}
            aria-label={tx.search}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={busy || q.trim().length < 2}>
          {tx.go}
        </button>
      </form>

      {!entry && !busy && (
        <div className="space-y-4">
          {chips(tx.suggestions)}
          {favorites.length > 0 && (
            <section className="card space-y-2 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Star size={16} weight="fill" className="text-amber-500" aria-hidden="true" /> {tx.favorites}
              </h2>
              {chips(favorites)}
            </section>
          )}
          {history.length > 0 && (
            <section className="card space-y-2 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <ClockCounterClockwise size={16} aria-hidden="true" /> {tx.history}
              </h2>
              {chips(history)}
            </section>
          )}
        </div>
      )}

      {busy && <Spinner label={tx.loading} />}
      {error && <ErrorBox message={error} onRetry={() => search(q)} />}

      {entry && (
        <article className="card overflow-hidden p-0">
          <header className="hero px-5 py-5 text-white sm:px-7">
            <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">Radiopaedia · {entry.en}</p>
            <h2 className="font-display mt-1 text-2xl font-extrabold sm:text-3xl">{entry.title}</h2>
          </header>
          <div className="space-y-4 p-5 sm:p-7">
            {!entry.from_radiopaedia && <p className="bg-warning-soft rounded-xl p-3 text-sm">{tx.noSource}</p>}
            <div className="prose-sm">
              <Markdown>{entry.body}</Markdown>
            </div>
            <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
              <a
                className="btn-primary"
                href={entry.sources[0]?.url ?? entry.search_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowSquareOut size={18} aria-hidden="true" /> {entry.sources[0] ? tx.open : tx.searchThere}
              </a>
              {entry.sources[0] && (
                <a className="btn-secondary" href={entry.search_url} target="_blank" rel="noopener noreferrer">
                  <MagnifyingGlass size={18} aria-hidden="true" /> {tx.searchThere}
                </a>
              )}
              <button className="btn-ghost" onClick={toggleFav} aria-pressed={isFav}>
                <Star
                  size={18}
                  weight={isFav ? "fill" : "regular"}
                  className={isFav ? "text-amber-500" : ""}
                  aria-hidden="true"
                />{" "}
                {isFav ? tx.saved : tx.save}
              </button>
            </div>
            <p className="text-muted text-xs">{tx.source}</p>
          </div>
        </article>
      )}
    </div>
  );
}
