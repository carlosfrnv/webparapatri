import { api } from "./api";
import type { DueCard } from "./types";

/**
 * Flashcards sin conexión: las tarjetas pendientes se guardan en el dispositivo cada vez que abre "Estudiar"
 * y los repasos hechos sin internet esperan en una cola hasta que vuelve la conexión.
 */

const CARDS_KEY = "offline-cards";
const QUEUE_KEY = "offline-reviews";

export interface QueuedReview {
  document_id: string;
  card_index: number;
  quality: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin espacio o modo privado: no se guarda */
  }
}

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export function saveOfflineCards(cards: DueCard[], lang: string) {
  write(CARDS_KEY, { saved_at: new Date().toISOString(), lang, cards });
}

/** Tarjetas guardadas, sin las que ya ha repasado sin conexión. */
export function offlineCards(): { saved_at: string; cards: DueCard[] } | null {
  const saved = read<{ saved_at: string; cards: DueCard[] } | null>(CARDS_KEY, null);
  if (!saved?.cards?.length) return null;
  const done = new Set(pendingReviews().map((r) => `${r.document_id}:${r.card_index}`));
  const cards = saved.cards.filter((c) => !done.has(`${c.document_id}:${c.card_index}`));
  return cards.length ? { saved_at: saved.saved_at, cards } : null;
}

export const pendingReviews = () => read<QueuedReview[]>(QUEUE_KEY, []);

export function queueReview(r: QueuedReview) {
  // Si la repasa dos veces sin conexión, cuenta la última nota.
  const list = pendingReviews().filter((x) => !(x.document_id === r.document_id && x.card_index === r.card_index));
  write(QUEUE_KEY, [...list, r]);
}

let syncing = false;

/** Envía los repasos pendientes. Devuelve cuántos se han enviado. */
export async function syncReviews(): Promise<number> {
  if (syncing || isOffline()) return 0;
  syncing = true;
  let sent = 0;
  try {
    for (const r of pendingReviews()) {
      try {
        await api.post("/flashcards/review", r);
      } catch (err) {
        // Sin conexión otra vez: se deja para luego. Otro error (tarjeta borrada…): se descarta.
        if ((err as { status?: number }).status === 0) break;
      }
      write(
        QUEUE_KEY,
        pendingReviews().filter((x) => !(x.document_id === r.document_id && x.card_index === r.card_index)),
      );
      sent++;
    }
  } finally {
    syncing = false;
  }
  return sent;
}
