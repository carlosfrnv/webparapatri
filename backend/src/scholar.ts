/**
 * Búsqueda de artículos científicos en Europe PMC (PubMed, PMC y más) y OpenAlex (casi toda la ciencia publicada:
 * revistas de cualquier país, SciELO, repositorios portugueses, libros…), gratis y sin clave.
 * Da autores, año, revista y DOI reales, así que las referencias se montan aquí, sin que la IA tenga que
 * buscar en internet (que con Claude se paga por búsqueda y por página leída).
 */

export interface Article {
  id: string;
  authors: { last: string; initials: string }[];
  collective?: string;
  year: string;
  title: string;
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url: string;
  abstract: string;
}

interface EpmcResult {
  id: string;
  source: string;
  pmid?: string;
  doi?: string;
  title?: string;
  pubYear?: string;
  pageInfo?: string;
  abstractText?: string;
  authorList?: { author?: { lastName?: string; initials?: string; collectiveName?: string }[] };
  journalInfo?: { volume?: string; issue?: string; journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
}

const API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const OPENALEX = "https://api.openalex.org/works";

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } | null; landing_page_url?: string | null } | null;
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null };
  abstract_inverted_index?: Record<string, number[]> | null;
}

// Partículas que no cuentan como inicial ("Maria da Silva" → Silva, M.).
const PARTICLES = new Set(["de", "da", "das", "do", "dos", "del", "la", "van", "von", "der", "e", "y"]);

/** "Hal O. Anger" → { last: "Anger", initials: "HO" } (en APA se usa el último apellido). */
function splitName(full: string) {
  const parts = full.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const last = parts.pop() ?? full;
  const initials = parts
    .filter((p) => !PARTICLES.has(p.toLowerCase()))
    .map((p) => p.split("-").map((x) => x.replace(/[^A-Za-zÀ-ÿ]/g, "")[0] ?? "").join(""))
    .join("");
  return { last, initials };
}

function fromOpenAlex(w: OpenAlexWork): Article | null {
  const idx = w.abstract_inverted_index;
  if (!idx || !w.title || !w.publication_year) return null;
  const words: string[] = [];
  for (const [word, pos] of Object.entries(idx)) for (const i of pos) words[i] = word;
  const abstract = clean(words.join(" "));
  if (abstract.length < 200) return null;
  const authors = (w.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((n): n is string => !!n)
    .map(splitName);
  if (!authors.length) return null;
  const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "") || undefined;
  const b = w.biblio ?? {};
  return {
    id: w.id,
    authors,
    year: String(w.publication_year),
    title: clean(w.title).replace(/\.$/, ""),
    journal: clean(w.primary_location?.source?.display_name ?? ""),
    volume: b.volume ?? undefined,
    issue: b.issue ?? undefined,
    pages: b.first_page ? `${b.first_page}${b.last_page && b.last_page !== b.first_page ? `-${b.last_page}` : ""}` : undefined,
    doi,
    url: doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url ?? w.id),
    abstract: abstract.slice(0, 1800),
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const clean = (s = "") =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

function toArticle(r: EpmcResult): Article | null {
  const abstract = clean(r.abstractText);
  const title = clean(r.title).replace(/\.$/, "");
  if (!title || !r.pubYear || abstract.length < 200) return null;
  const list = r.authorList?.author ?? [];
  const authors = list
    .filter((a) => a.lastName)
    .map((a) => ({ last: a.lastName!, initials: (a.initials ?? "").replace(/[^A-Za-zÀ-ÿ]/g, "") }));
  const collective = list.find((a) => a.collectiveName)?.collectiveName;
  if (!authors.length && !collective) return null;
  return {
    id: `${r.source}:${r.id}`,
    authors,
    collective,
    year: r.pubYear,
    title,
    journal: clean(r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher ?? ""),
    volume: r.journalInfo?.volume,
    issue: r.journalInfo?.issue,
    pages: r.pageInfo,
    doi: r.doi,
    url: r.doi
      ? `https://doi.org/${r.doi}`
      : r.pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`
        : `https://europepmc.org/article/${r.source}/${r.id}`,
    abstract: abstract.slice(0, 1800),
  };
}

/** Busca artículos con resumen para unas consultas, en las dos bases de datos a la vez. */
export async function searchArticles(queries: string[], limit = 8): Promise<Article[]> {
  const seen = new Set<string>();
  const out: Article[] = [];
  const qs = queries.slice(0, 4);
  const results = await Promise.all([
    ...qs.map(async (q) => {
      const data = await getJson<{ resultList?: { result?: EpmcResult[] } }>(
        `${API}?${new URLSearchParams({
          query: `(${q}) AND HAS_ABSTRACT:y AND (LANG:eng OR LANG:por OR LANG:spa)`,
          resultType: "core",
          format: "json",
          pageSize: "8",
        })}`,
      );
      return (data?.resultList?.result ?? []).map(toArticle);
    }),
    ...qs.map(async (q) => {
      const data = await getJson<{ results?: OpenAlexWork[] }>(
        `${OPENALEX}?${new URLSearchParams({
          search: q,
          filter: "has_abstract:true,type:article|review|book-chapter|book",
          "per-page": "8",
        })}`,
      );
      return (data?.results ?? []).map(fromOpenAlex);
    }),
  ]);
  // Se van alternando consultas y bases de datos para que haya variedad (no todo de la primera).
  for (let i = 0; i < 8 && out.length < limit; i++) {
    for (const list of results) {
      const a = list[i];
      if (!a) continue;
      const key = (a.doi ?? a.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Cómo se cita en el texto: (Anger, 1958), (Rich & Smith, 1997), (Belcari et al., 2023). */
export function inTextCite(a: Article) {
  const n = a.authors;
  const who = a.collective && !n.length
    ? a.collective
    : n.length === 1
      ? n[0].last
      : n.length === 2
        ? `${n[0].last} & ${n[1].last}`
        : `${n[0].last} et al.`;
  return `${who}, ${a.year}`;
}

/** Referencia completa en APA 7 (todos los autores hasta 20) o Vancouver. */
export function formatReference(a: Article, style: "APA" | "Vancouver") {
  const vol = a.volume ?? "";
  const pages = (a.pages ?? "").replace(/-/g, "–");
  if (style === "Vancouver") {
    const names = a.authors.map((x) => `${x.last} ${x.initials}`);
    const who = names.length > 6 ? `${names.slice(0, 6).join(", ")}, et al` : names.join(", ") || a.collective;
    return `${who}. ${a.title}${/[?!]$/.test(a.title) ? "" : "."} ${a.journal}. ${a.year}${vol ? `;${vol}` : ""}${a.issue ? `(${a.issue})` : ""}${
      pages ? `:${pages}` : ""
    }.${a.doi ? ` doi:${a.doi}` : ` ${a.url}`}`;
  }
  const names = a.authors.map((x) => `${x.last}, ${x.initials.split("").map((c) => `${c}.`).join(" ")}`.trim());
  const who =
    names.length > 20
      ? `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`
        : names[0] ?? a.collective;
  const source = a.journal
    ? ` *${a.journal}${vol ? `, ${vol}` : ""}*${a.issue ? `(${a.issue})` : ""}${pages ? `, ${pages}` : ""}.`
    : "";
  return `${who} (${a.year}). ${a.title}${/[?!]$/.test(a.title) ? "" : "."}${source} ${a.url}`;
}
