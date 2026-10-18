import webpush from "web-push";
import { config } from "./config";
import type { Lang } from "./i18n";
import { localName } from "./seed";
import { supabase } from "./supabase";

/**
 * Recordatorios en el móvil o el iPad (Web Push). Cada navegador en el que ella activa los avisos
 * guarda una "suscripción"; el servidor manda los avisos a esas suscripciones.
 * En el iPad solo funciona si la web se ha añadido a la pantalla de inicio (iOS 16.4 o posterior).
 */

/**
 * Claves VAPID para firmar los avisos. Si no se ponen en Render (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY),
 * se generan solas la primera vez y se guardan en la base de datos (tabla privada, solo el servidor la lee).
 */
let vapid: Promise<{ publicKey: string } | null> | null = null;

export function vapidKeys() {
  vapid ??= (async () => {
    let keys =
      config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
        ? { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY }
        : null;
    if (!keys) {
      const { data, error } = await supabase
        .from("couple_settings")
        .select("value")
        .eq("key", "vapid_keys")
        .maybeSingle();
      // Falta ejecutar el SQL: sin avisos de momento (se vuelve a intentar en la siguiente petición).
      if (error) {
        vapid = null;
        return null;
      }
      keys = (data?.value as typeof keys) ?? null;
      if (!keys) {
        keys = webpush.generateVAPIDKeys();
        await supabase.from("couple_settings").insert({ key: "vapid_keys", value: keys });
        // Si a la vez otro proceso las ha creado, nos quedamos con las guardadas.
        const { data: saved } = await supabase.from("couple_settings").select("value").eq("key", "vapid_keys").single();
        keys = (saved?.value as typeof keys) ?? keys;
      }
    }
    webpush.setVapidDetails(
      `mailto:${config.ALLOWED_EMAIL || "avisos@estudioimr.es"}`,
      keys!.publicKey,
      keys!.privateKey,
    );
    return { publicKey: keys!.publicKey };
  })();
  return vapid;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Página que se abre al tocar el aviso. */
  url?: string;
}

interface SubscriptionRow {
  endpoint: string;
  user_id: string;
  email: string | null;
  lang: Lang | null;
  subscription: webpush.PushSubscription;
}

async function sendTo(rows: SubscriptionRow[], message: (lang: Lang) => PushMessage) {
  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(message(row.lang ?? "es")), { TTL: 12 * 3600 });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // La suscripción ya no existe (ha desactivado los avisos o borrado la web): se olvida.
      if (status === 404 || status === 410)
        await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
      else console.error("Error al mandar un aviso:", status, (err as Error).message);
    }
  }
  return sent;
}

async function subscriptions(filter: { userId?: string; email?: string } = {}) {
  let q = supabase.from("push_subscriptions").select("endpoint, user_id, email, lang, subscription");
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.email) q = q.eq("email", filter.email);
  const { data, error } = await q;
  if (error) {
    // Falta ejecutar el SQL: sin avisos.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []) as SubscriptionRow[];
}

export async function pushToUser(userId: string, message: (lang: Lang) => PushMessage) {
  if (!(await vapidKeys())) return 0;
  return sendTo(await subscriptions({ userId }), message);
}

/** Avisos para ella (el primer email de ALLOWED_EMAIL), p. ej., cuando Carlos le deja una nota. */
export async function pushToStudent(message: (lang: Lang) => PushMessage) {
  if (!(await vapidKeys())) return 0;
  return sendTo(await subscriptions(config.ALLOWED_EMAIL ? { email: config.ALLOWED_EMAIL } : {}), message);
}

// ---------- Recordatorios del día ----------

const TZ = "Europe/Lisbon";

/** Fecha (AAAA-MM-DD) y hora en Portugal. */
function lisbonNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const TEXT = {
  es: {
    title: "Tu día de estudio 🖤",
    examToday: (s: string) => `Hoy es el examen de ${s}. ¡Mucha suerte, nena!`,
    examTomorrow: (s: string) => `Mañana tienes el examen de ${s}. Repaso suave y a dormir pronto.`,
    examIn: (s: string, n: number) => `Faltan ${n} días para el examen de ${s}.`,
    dueToday: (s: string) => `Hoy se entrega: ${s}.`,
    dueTomorrow: (s: string) => `Mañana se entrega: ${s}.`,
    cards: (n: number) => `Tienes ${n} flashcards por repasar.`,
  },
  pt: {
    title: "O teu dia de estudo 🖤",
    examToday: (s: string) => `Hoje é o exame de ${s}. Muita sorte, nena!`,
    examTomorrow: (s: string) => `Amanhã tens o exame de ${s}. Revisão leve e cama cedo.`,
    examIn: (s: string, n: number) => `Faltam ${n} dias para o exame de ${s}.`,
    dueToday: (s: string) => `Hoje entrega-se: ${s}.`,
    dueTomorrow: (s: string) => `Amanhã entrega-se: ${s}.`,
    cards: (n: number) => `Tens ${n} flashcards para rever.`,
  },
};

const MIN_CARDS = 10;

/** Las líneas del aviso de hoy para un usuario (vacío si no hay nada que recordar). */
async function remindersFor(userId: string, today: string, lang: Lang): Promise<string[]> {
  const tx = TEXT[lang];
  const lines: string[] = [];

  const { data: exams } = await supabase
    .from("exams")
    .select("title, kind, exam_date, subjects(name, translations)")
    .eq("user_id", userId)
    .gte("exam_date", today)
    .lte("exam_date", addDays(today, 7));
  for (const e of exams ?? []) {
    const s = e.subjects as unknown as { name: string; translations: unknown } | null;
    const subject = s ? localName(s, lang) : null;
    const name = subject && subject !== e.title ? `${subject} (${e.title})` : e.title;
    const days = Math.round((Date.parse(e.exam_date) - Date.parse(today)) / 86_400_000);
    if (e.kind === "assignment") {
      if (days === 0) lines.push(tx.dueToday(name));
      else if (days === 1) lines.push(tx.dueTomorrow(name));
    } else if (days === 0) lines.push(tx.examToday(name));
    else if (days === 1) lines.push(tx.examTomorrow(name));
    else if (days === 3 || days === 7) lines.push(tx.examIn(name, days));
  }

  // Flashcards por repasar: todas las tarjetas menos las que aún no tocan.
  const [{ data: materials }, { count: notDue }] = await Promise.all([
    supabase.from("study_materials").select("flashcards").eq("user_id", userId),
    supabase
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gt("due_at", new Date().toISOString()),
  ]);
  const total = (materials ?? []).reduce((n, m) => n + ((m.flashcards as unknown[] | null)?.length ?? 0), 0);
  const due = total - (notDue ?? 0);
  if (due >= MIN_CARDS) lines.push(tx.cards(due));

  return lines;
}

let running = false;

/**
 * Manda los recordatorios del día una sola vez, a partir de REMINDER_HOUR (hora de Portugal).
 * Se llama en cada ping a /health (cron-job.org lo hace cada 10 minutos) y cada 15 minutos.
 * El día del último envío se guarda en la base de datos, así no se repite aunque el servidor se reinicie.
 */
export async function maybeSendDailyReminders() {
  if (running) return;
  const { date: today, hour } = lisbonNow();
  if (hour < config.REMINDER_HOUR) return;
  running = true;
  try {
    if (!(await vapidKeys())) return;
    const { data: last, error } = await supabase
      .from("couple_settings")
      .select("value")
      .eq("key", "reminders_last_sent")
      .maybeSingle();
    if (error || last?.value === today) return;
    await supabase
      .from("couple_settings")
      .upsert({ key: "reminders_last_sent", value: today, updated_at: new Date().toISOString() });

    const subs = await subscriptions();
    for (const userId of new Set(subs.map((s) => s.user_id))) {
      const mine = subs.filter((s) => s.user_id === userId);
      const lang = mine[0].lang ?? "es";
      const lines = await remindersFor(userId, today, lang);
      if (lines.length > 0) await sendTo(mine, (l) => ({ title: TEXT[l].title, body: lines.join("\n"), url: "/" }));
    }
  } catch (err) {
    console.error("Error en los recordatorios del día:", err);
  } finally {
    running = false;
  }
}
