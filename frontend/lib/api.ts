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

// O plano gratuito do Render "adormece" o servidor. Enquanto acorda, mostramos um aviso.
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
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch com sessão e tentativas automáticas enquanto o servidor acorda. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const maxAttempts = 8;
  let waking = false;
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${API_URL}${path}`, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), ...(await authHeader()) },
        });
        // 502/503/504: o Render ainda está a arrancar.
        if ([502, 503, 504].includes(res.status) && attempt < maxAttempts) throw new TypeError("waking");
        return res;
      } catch (err) {
        if (!(err instanceof TypeError) || attempt >= maxAttempts) {
          throw new ApiError(0, "Não foi possível ligar ao servidor. Verifica a internet e tenta novamente.");
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
    throw new ApiError(res.status, (body as { error?: string }).error ?? "Ocorreu um erro. Tenta novamente.");
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
  del: (path: string) => apiFetch(path, { method: "DELETE" }).then((r) => handle<void>(r)),
};

/** Envio de ficheiro com barra de progresso (o fetch não dá progresso de envio). */
export async function uploadFile<T>(
  file: File,
  subjectId: string | null,
  onProgress: (fraction: number) => void,
): Promise<T> {
  // Acorda o servidor primeiro, para o envio não falhar a meio.
  await apiFetch("/health").catch(() => undefined);
  const headers = await authHeader();
  const form = new FormData();
  form.append("file", file);
  if (subjectId) form.append("subject_id", subjectId);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/documents`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* resposta vazia */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body.error ?? "Não foi possível carregar este ficheiro. Tenta novamente."));
    };
    xhr.onerror = () => reject(new ApiError(0, "Falhou a ligação durante o envio. Tenta novamente."));
    xhr.send(form);
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Ocorreu um erro. Tenta novamente.";
}
