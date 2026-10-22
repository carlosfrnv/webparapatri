import { dict, getLang } from "./i18n";
import { supabase } from "./supabase";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:10000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// El plan gratuito de Render "duerme" el servidor. Mientras se despierta, mostramos un aviso.
type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
export function onServerWaking(listener: WakeListener) {
  wakeListeners.add(listener);
  return () => {
    wakeListeners.delete(listener);
  };
}
let wakingCount = 0;
function setWaking(delta: number) {
  wakingCount = Math.max(0, wakingCount + delta);
  wakeListeners.forEach((l) => l(wakingCount > 0));
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // El backend responde (y la IA escribe) en el idioma elegido.
  return { "X-Lang": getLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch con sesión y reintentos automáticos mientras el servidor se despierta. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Sin conexión no tiene sentido esperar a que "despierte" el servidor.
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError(0, dict().common.networkError);
  const maxAttempts = 8;
  let waking = false;
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${API_URL}${path}`, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), ...(await authHeader()) },
        });
        // 502/503/504: Render todavía está arrancando.
        if ([502, 503, 504].includes(res.status) && attempt < maxAttempts) throw new TypeError("waking");
        return res;
      } catch (err) {
        if (!(err instanceof TypeError) || attempt >= maxAttempts) {
          throw new ApiError(0, dict().common.networkError);
        }
        if (!waking) {
          waking = true;
          setWaking(1);
        }
        await sleep(Math.min(3000 * attempt, 10000));
      }
    }
  } finally {
    if (waking) setWaking(-1);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) await supabase.auth.signOut();
    throw new ApiError(res.status, (body as { error?: string }).error ?? dict().common.genericError);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch(path).then((r) => handle<T>(r)),
  post: <T>(path: string, data?: unknown) =>
    apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    }).then((r) => handle<T>(r)),
  patch: <T>(path: string, data: unknown) =>
    apiFetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => handle<T>(r)),
  put: <T>(path: string, data: unknown) =>
    apiFetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => handle<T>(r)),
  del: (path: string) => apiFetch(path, { method: "DELETE" }).then((r) => handle<void>(r)),
};

/** Subida de archivo con barra de progreso (fetch no da el progreso de subida). */
export interface UploadFields {
  subjectId?: string | null;
  /** "referencia" = biblioteca de referencia (IAEA / EFRS), separada de los apuntes. */
  sourceType?: "apuntes" | "referencia";
  referenceOrg?: "IAEA" | "EFRS";
}

export async function uploadFile<T>(
  file: File,
  fields: UploadFields,
  onProgress: (fraction: number) => void,
  /** "/documents/audio" para las clases grabadas. */
  path = "/documents",
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  if (fields.subjectId) form.append("subject_id", fields.subjectId);
  if (fields.sourceType) form.append("source_type", fields.sourceType);
  if (fields.referenceOrg) form.append("reference_org", fields.referenceOrg);
  return sendForm<T>(form, onProgress, path);
}

/** Varias fotos de apuntes a la vez: el servidor las junta en un PDF y la IA las pasa a texto. */
export async function uploadPhotos<T>(
  photos: Blob[],
  fields: { subjectId: string | null; title: string },
  onProgress: (fraction: number) => void,
): Promise<T> {
  const form = new FormData();
  photos.forEach((p, i) => form.append("files", p, `foto-${i + 1}.jpg`));
  if (fields.subjectId) form.append("subject_id", fields.subjectId);
  form.append("title", fields.title);
  return sendForm<T>(form, onProgress, "/documents/photos");
}

async function sendForm<T>(form: FormData, onProgress: (fraction: number) => void, path: string): Promise<T> {
  // Si se corta (p. ej., el servidor se estaba reiniciando), se espera a que vuelva y se reintenta.
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendFormOnce<T>(form, onProgress, path);
    } catch (err) {
      const status = (err as ApiError).status;
      if (attempt >= 3 || ![0, 502, 503, 504].includes(status)) throw err;
      onProgress(0);
      await sleep(4000 * attempt);
    }
  }
}

async function sendFormOnce<T>(form: FormData, onProgress: (fraction: number) => void, path: string): Promise<T> {
  // Primero despierta el servidor, para que la subida no falle a medias.
  await apiFetch("/health").catch(() => undefined);
  const headers = await authHeader();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta vacía */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body.error ?? dict().common.uploadError));
    };
    xhr.onerror = () => reject(new ApiError(0, dict().common.uploadNetworkError));
    xhr.send(form);
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return dict().common.genericError;
}
