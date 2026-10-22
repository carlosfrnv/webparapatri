/**
 * Comprueba que los enlaces y DOI de las referencias existen, para que ella no tenga que abrirlos uno a uno.
 * Solo se da por "roto" lo que seguro que no existe (404/410, dominio inexistente o DOI desconocido): muchas webs
 * científicas bloquean a los robots (403, 429…) y eso no significa que el enlace esté mal.
 */

type Status = "ok" | "dead" | "unknown";

const URL_RE = /https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:]/g;
const DOI_RE = /\b(10\.\d{4,9}\/[^\s<>()\]]+[^\s<>()\].,;:])/;

const cache = new Map<string, { status: Status; at: number }>();

export async function checkUrl(url: string): Promise<Status> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.status;
  let status: Status = "unknown";
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; EstudioIMR/1.0; comprobador de referencias)",
        accept:
          "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
      },
    });
    res.body?.cancel().catch(() => undefined);
    status = res.ok
      ? "ok"
      : res.status === 404 || res.status === 410
        ? "dead"
        : "unknown";
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    // Dominio que no existe: seguro que está mal. Tiempo agotado o conexión cortada: no se sabe.
    if (code === "ENOTFOUND") status = "dead";
  }
  cache.set(url, { status, at: Date.now() });
  return status;
}

/** Enlaces de una línea de referencia (el DOI, si lo hay, se comprueba en doi.org). */
function linksOf(line: string) {
  const urls = new Set(line.match(URL_RE) ?? []);
  const doi = line.match(DOI_RE)?.[1];
  if (doi && ![...urls].some((u) => u.includes(doi)))
    urls.add(`https://doi.org/${doi}`);
  return [...urls];
}

/** Estado de una referencia: rota si alguno de sus enlaces no existe; comprobada si al menos uno responde. */
export async function checkReference(line: string): Promise<Status> {
  const links = linksOf(line);
  if (!links.length) return "unknown";
  const results = await Promise.all(links.map(checkUrl));
  if (results.includes("dead")) return "dead";
  return results.includes("ok") ? "ok" : "unknown";
}

/**
 * Quita de la sección "Fuentes"/"Fontes" de una investigación las referencias rotas.
 * Devuelve el texto limpio, las URL que quedan fuera y cuántas se han podido comprobar.
 */
export async function cleanResearchSources(research: string) {
  const m = research.match(
    /(###\s*(?:Fuentes|Fontes)\s*\n)([\s\S]*?)(?=\n###|$)/i,
  );
  if (!m) return { research, dead: [] as string[], checked: 0 };
  // Si el servidor no tiene internet en ese momento, todo parecería roto: entonces no se quita nada.
  if ((await checkUrl("https://doi.org/")) === "dead")
    return { research, dead: [] as string[], checked: 0 };
  const lines = m[2].split("\n");
  const isRef = (l: string) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l);
  const statuses = await Promise.all(
    lines.map((l) =>
      isRef(l) ? checkReference(l) : Promise.resolve("unknown" as Status),
    ),
  );
  // Por si acaso: si saliera todo roto, se deja como está (mejor revisar a mano que quedarse sin fuentes).
  const refs = statuses.filter((_, i) => isRef(lines[i]));
  if (refs.length && refs.every((st) => st === "dead"))
    return { research, dead: [] as string[], checked: 0 };
  const dead = lines.filter((_, i) => statuses[i] === "dead").flatMap(linksOf);
  const kept = lines.filter((_, i) => statuses[i] !== "dead");
  const checked = statuses.filter((st) => st === "ok").length;
  return {
    research: research.replace(m[0], m[1] + kept.join("\n")),
    dead,
    checked,
  };
}
