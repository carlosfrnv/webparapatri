import type { WebSource } from "../web";

export type Effort = "low" | "medium" | "high";

/** Petición común a todos los proveedores de IA (Gemini, Groq, Anthropic). */
export interface LlmRequest {
  system: string;
  prompt: string;
  effort: Effort;
  maxTokens: number;
  /** Pide la respuesta en JSON (los proveedores que lo admiten activan su modo JSON). */
  json: boolean;
  /** Activa la búsqueda web en Radiopaedia, IAEA y EFRS si el proveedor la tiene. */
  web: boolean;
  /** Modo trabajo: búsqueda abierta en cualquier web (fuentes fiables) y más búsquedas. */
  research?: boolean;
  /** Fotos adjuntas por la estudiante (base64), para los proveedores que pueden verlas. */
  images?: LlmImage[];
  onText?: (delta: string) => void;
  onWebTool?: (tool: "web_search" | "web_fetch") => void;
}

export interface LlmImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

export interface LlmResult {
  text: string;
  webSources: WebSource[];
  webSearches: number;
  /**
   * HTML de las "sugerencias de búsqueda" de Google. Las condiciones de Gemini obligan a mostrarlo
   * cuando una respuesta usa la búsqueda con Google.
   */
  searchSuggestionsHtml?: string;
}

export interface Provider {
  id: "gemini" | "groq" | "anthropic";
  /** Si el proveedor puede buscar en internet. */
  supportsWeb: boolean;
  /** De pago (Claude): en los trabajos en segundo plano solo se usa si las gratuitas no pueden. */
  paid?: boolean;
  /** Si el proveedor puede ver imágenes. */
  supportsImages: boolean;
  generate(model: string, req: LlmRequest): Promise<LlmResult>;
}

/**
 * Error de un proveedor ya clasificado:
 *  - quota: cupo gratuito agotado (por minuto o por día). Se prueba el siguiente de la cadena.
 *  - unavailable: el servicio o el modelo no responde o no existe. Se prueba el siguiente.
 *  - noWeb: la búsqueda web no está disponible (p. ej., no entra en el plan gratuito). Se repite sin web.
 *  - tooLarge: la petición no cabe en los límites del plan gratuito. Se prueba el siguiente.
 *  - refused: el modelo se ha negado a responder por sus filtros de seguridad.
 */
export class ProviderError extends Error {
  constructor(
    public kind: "quota" | "unavailable" | "noWeb" | "tooLarge" | "refused",
    message: string,
    /** Cuánto tiempo no volver a intentar con este modelo. */
    public cooldownMs = 0,
  ) {
    super(message);
  }
}

/** Clasifica un error HTTP genérico (Gemini y Groq devuelven `status`). */
export function classifyHttpError(err: unknown, opts: { usedWeb: boolean }): ProviderError | null {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? err);
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) {
    // Si el cupo agotado es el diario, no lo reintentamos en una hora; si es por minuto, en un minuto.
    const daily = /per.?day|daily|PerDay|RPD|requests per day|tokens per day/i.test(message);
    if (opts.usedWeb && /search|ground/i.test(message)) return new ProviderError("noWeb", message, 60 * 60_000);
    return new ProviderError("quota", message, daily ? 60 * 60_000 : 60_000);
  }
  if (status === 413) return new ProviderError("tooLarge", message, 60_000);
  if (status === 400 && opts.usedWeb) return new ProviderError("noWeb", message, 60 * 60_000);
  if (status === 404) return new ProviderError("unavailable", message, 24 * 60 * 60_000);
  if (status === 401 || status === 403) return new ProviderError("unavailable", message, 10 * 60_000);
  if (status && status >= 500) return new ProviderError("unavailable", message, 30_000);
  if (!status && /fetch failed|ECONN|ETIMEDOUT|network/i.test(message)) {
    return new ProviderError("unavailable", message, 30_000);
  }
  return null;
}
