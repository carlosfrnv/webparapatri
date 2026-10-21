import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { previews, type Rating, type Sched, schedule } from "../anki";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { materialInLang } from "../study";
import { STORAGE_BUCKET } from "../config";
import { supabase } from "../supabase";

/**
 * Mazos tipo Anki: tarjetas propias (escritas a mano, pegadas de Anki o copiadas de sus apuntes) con la
 * programación de Anki. Es aparte de las tarjetas de los apuntes (/flashcards), que siguen igual.
 */
export const decksRouter = Router();

// Si aún no se ha ejecutado el SQL de los mazos, se avisa en vez de fallar.
// (o faltan las columnas nuevas: tarjetas de imagen).
const missingTable = (code?: string) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(code ?? "");
function check(error: { code?: string } | null) {
  if (missingTable(error?.code)) throw new HttpError(409, "needsUpdate");
  if (error) throw error;
}

const CARD_FIELDS =
  "id, deck_id, front, back, state, step, interval_days, ease, lapses, reps, due_at, created_at, image_path, occlusion";

// Láminas de las tarjetas de imagen (nombres tapados): se guardan en el almacenamiento privado.
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

/** Añade a cada tarjeta de imagen un enlace temporal a su lámina. */
async function withImages<T extends { image_path?: string | null }>(cards: T[]) {
  const paths = [...new Set(cards.map((c) => c.image_path).filter((p): p is string => !!p))];
  if (!paths.length) return cards.map((c) => ({ ...c, image_url: null as string | null }));
  const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3 * 3600);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return cards.map((c) => ({ ...c, image_url: (c.image_path && urls.get(c.image_path)) || null }));
}
// Las tarjetas en aprendizaje que tocan dentro de poco se adelantan (como en Anki).
const LEARN_AHEAD_MS = 20 * 60_000;

interface CardRow extends Sched {
  id: string;
  image_path?: string | null;
  deck_id: string;
  front: string;
  back: string;
  created_at: string;
}

/** El "día" de estudio empieza a las 4:00 de su hora local (tz = getTimezoneOffset del navegador). */
function dayBounds(tzQuery: unknown, now = new Date()) {
  const tz = Math.max(-900, Math.min(900, Number(tzQuery) || 0));
  const local = new Date(now.getTime() - tz * 60_000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4));
  if (local.getTime() < start.getTime()) start.setUTCDate(start.getUTCDate() - 1);
  const startUtc = new Date(start.getTime() + tz * 60_000);
  return { start: startUtc, end: new Date(startUtc.getTime() + 24 * 3600_000) };
}

async function ownDeck(userId: string, deckId: string) {
  const { data, error } = await supabase
    .from("decks")
    .select("id, name, new_per_day, created_at")
    .eq("id", deckId)
    .eq("user_id", userId)
    .maybeSingle();
  check(error);
  if (!data) throw new HttpError(404, "deckNotFound");
  return data;
}

/** Nuevas ya empezadas hoy en cada mazo (para el límite diario). */
async function newStudiedToday(userId: string, since: Date) {
  const { data, error } = await supabase
    .from("deck_review_log")
    .select("deck_id")
    .eq("user_id", userId)
    .eq("was_new", true)
    .gte("reviewed_at", since.toISOString());
  check(error);
  const out = new Map<string, number>();
  for (const r of data ?? []) out.set(r.deck_id, (out.get(r.deck_id) ?? 0) + 1);
  return out;
}

const withPreviews = <T extends CardRow>(c: T) => ({ ...c, previews: previews(c) });

decksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { start, end } = dayBounds(req.query.tz);
    const { data: decks, error } = await supabase
      .from("decks")
      .select("id, name, new_per_day, created_at")
      .eq("user_id", userId)
      .order("created_at");
    if (missingTable(error?.code)) {
      res.json({ ready: false, decks: [] });
      return;
    }
    check(error);
    const { data: cards, error: e2 } = await supabase
      .from("deck_cards")
      .select("deck_id, state, due_at")
      .eq("user_id", userId);
    check(e2);
    const done = await newStudiedToday(userId, start);
    const soon = Date.now() + LEARN_AHEAD_MS;
    const out = (decks ?? []).map((d) => {
      let total = 0;
      let fresh = 0;
      let learning = 0;
      let review = 0;
      for (const c of cards ?? []) {
        if (c.deck_id !== d.id) continue;
        total++;
        const due = new Date(c.due_at).getTime();
        if (c.state === "new") fresh++;
        else if (c.state === "review") review += due < end.getTime() ? 1 : 0;
        else learning += due <= soon ? 1 : 0;
      }
      const newToday = Math.max(0, Math.min(fresh, d.new_per_day - (done.get(d.id) ?? 0)));
      return { ...d, total, new_total: fresh, new_today: newToday, learning, review };
    });
    res.json({ ready: true, decks: out });
  }),
);

const deckSchema = z.object({
  name: z.string().trim().min(1).max(120),
  new_per_day: z.number().int().min(0).max(500).optional(),
});

decksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = deckSchema.parse(req.body);
    const { data, error } = await supabase
      .from("decks")
      .insert({ ...body, user_id: userIdOf(req) })
      .select("id, name, new_per_day, created_at")
      .single();
    check(error);
    res.status(201).json(data);
  }),
);

decksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = deckSchema.partial().parse(req.body);
    await ownDeck(userId, req.params.id as string);
    const { data, error } = await supabase
      .from("decks")
      .update(body)
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select("id, name, new_per_day, created_at")
      .single();
    check(error);
    res.json(data);
  }),
);

decksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await ownDeck(userId, req.params.id as string);
    const { data: imgs } = await supabase
      .from("deck_cards")
      .select("image_path")
      .eq("deck_id", req.params.id)
      .not("image_path", "is", null);
    const { error } = await supabase.from("decks").delete().eq("id", req.params.id).eq("user_id", userId);
    check(error);
    const paths = [...new Set((imgs ?? []).map((c) => c.image_path as string))];
    if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    res.status(204).end();
  }),
);

/** Un mazo con todas sus tarjetas y la previsión de repasos de los próximos 7 días. */
decksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const deck = await ownDeck(userId, req.params.id as string);
    const { data: cards, error } = await supabase
      .from("deck_cards")
      .select(CARD_FIELDS)
      .eq("deck_id", deck.id)
      .eq("user_id", userId)
      .order("created_at");
    check(error);
    const { start } = dayBounds(req.query.tz);
    const forecast = Array.from({ length: 7 }, () => 0);
    for (const c of cards ?? []) {
      if (c.state === "new") continue;
      const day = Math.floor((new Date(c.due_at).getTime() - start.getTime()) / (24 * 3600_000));
      forecast[Math.max(0, Math.min(6, day))] += day <= 6 ? 1 : 0;
    }
    res.json({ ...deck, cards: await withImages(cards ?? []), forecast });
  }),
);

// Recuadros en fracciones de la imagen (0–1); `target` = el que pregunta esta tarjeta.
const occlusionSchema = z.object({
  boxes: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
        label: z.string().trim().max(300).default(""),
      }),
    )
    .min(1)
    .max(150),
  target: z.number().int().min(0),
});

const cardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(4000),
        back: z.string().trim().min(1).max(8000),
        image_path: z.string().max(300).optional(),
        occlusion: occlusionSchema.optional(),
      }),
    )
    .min(1)
    .max(2000),
});

/** Sube la lámina de unas tarjetas de imagen; devuelve dónde ha quedado guardada. */
decksRouter.post(
  "/:id/images",
  imageUpload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await ownDeck(userId, req.params.id as string);
    const file = req.file;
    if (!file) throw new HttpError(400, "noFile");
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw new HttpError(400, "unsupportedType");
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/decks/${req.params.id}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new HttpError(500, "saveFailed");
    res.status(201).json({ path });
  }),
);

decksRouter.post(
  "/:id/cards",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const deck = await ownDeck(userId, req.params.id as string);
    const { cards } = cardsSchema.parse(req.body);
    // Solo láminas suyas de este mazo, y el recuadro preguntado tiene que existir.
    for (const c of cards) {
      if (c.image_path && !c.image_path.startsWith(`${userId}/decks/${deck.id}/`)) throw new HttpError(400, "invalidData");
      if (c.occlusion && (!c.image_path || c.occlusion.target >= c.occlusion.boxes.length))
        throw new HttpError(400, "invalidData");
    }
    const { data, error } = await supabase
      .from("deck_cards")
      .insert(cards.map((c) => ({ ...c, deck_id: deck.id, user_id: userId })))
      .select(CARD_FIELDS);
    check(error);
    res.status(201).json(data ?? []);
  }),
);

/** Copia al mazo las tarjetas de uno de sus apuntes (sin repetir las que ya tenga). */
decksRouter.post(
  "/:id/import",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const deck = await ownDeck(userId, req.params.id as string);
    const { document_id } = z.object({ document_id: z.string().uuid() }).parse(req.body);
    const { data: material } = await supabase
      .from("study_materials")
      .select("flashcards, lang, translations")
      .eq("document_id", document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!material) throw new HttpError(404, "documentNotFound");
    const cards = ((materialInLang(material, langOf(req))?.flashcards ?? material.flashcards ?? []) as {
      front: string;
      back: string;
    }[]).filter((c) => c.front?.trim() && c.back?.trim());
    const { data: existing, error } = await supabase.from("deck_cards").select("front").eq("deck_id", deck.id);
    check(error);
    const have = new Set((existing ?? []).map((c) => c.front.trim()));
    const fresh = cards.filter((c) => !have.has(c.front.trim()));
    if (fresh.length) {
      const { error: e2 } = await supabase
        .from("deck_cards")
        .insert(fresh.map((c) => ({ front: c.front, back: c.back, deck_id: deck.id, user_id: userId })));
      check(e2);
    }
    res.json({ added: fresh.length, skipped: cards.length - fresh.length });
  }),
);

decksRouter.patch(
  "/cards/:cardId",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = z
      .object({ front: z.string().trim().min(1).max(4000).optional(), back: z.string().trim().min(1).max(8000).optional() })
      .parse(req.body);
    const { data, error } = await supabase
      .from("deck_cards")
      .update(body)
      .eq("id", req.params.cardId)
      .eq("user_id", userId)
      .select(CARD_FIELDS)
      .maybeSingle();
    check(error);
    if (!data) throw new HttpError(404, "deckNotFound");
    res.json(data);
  }),
);

decksRouter.delete(
  "/cards/:cardId",
  asyncHandler(async (req, res) => {
    const { data: gone, error } = await supabase
      .from("deck_cards")
      .delete()
      .eq("id", req.params.cardId)
      .eq("user_id", userIdOf(req))
      .select("image_path");
    check(error);
    // Si era la última tarjeta de su lámina, se borra también la imagen.
    const path = gone?.[0]?.image_path as string | null | undefined;
    if (path) {
      const { count } = await supabase
        .from("deck_cards")
        .select("id", { count: "exact", head: true })
        .eq("image_path", path);
      if (!count) await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    }
    res.status(204).end();
  }),
);

/** Cola de estudio: primero las de aprendizaje que tocan, luego los repasos del día y las nuevas (con su límite). */
decksRouter.get(
  "/:id/study",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const deck = await ownDeck(userId, req.params.id as string);
    const { start, end } = dayBounds(req.query.tz);
    const { data, error } = await supabase
      .from("deck_cards")
      .select(CARD_FIELDS)
      .eq("deck_id", deck.id)
      .eq("user_id", userId)
      .order("due_at");
    check(error);
    const done = (await newStudiedToday(userId, start)).get(deck.id) ?? 0;
    const soon = Date.now() + LEARN_AHEAD_MS;
    const cards = (data ?? []) as CardRow[];
    const learning = cards.filter((c) => (c.state === "learning" || c.state === "relearning") && new Date(c.due_at).getTime() <= soon);
    const review = cards.filter((c) => c.state === "review" && new Date(c.due_at).getTime() < end.getTime());
    const fresh = cards
      .filter((c) => c.state === "new")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, Math.max(0, deck.new_per_day - done));
    res.json({
      deck,
      learn_ahead_ms: LEARN_AHEAD_MS,
      day_end: end.toISOString(),
      cards: (await withImages([...learning, ...review, ...fresh])).map(withPreviews),
    });
  }),
);

decksRouter.post(
  "/cards/:cardId/answer",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { rating } = z.object({ rating: z.number().int().min(1).max(4) }).parse(req.body);
    const { data: card, error } = await supabase
      .from("deck_cards")
      .select(CARD_FIELDS)
      .eq("id", req.params.cardId)
      .eq("user_id", userId)
      .maybeSingle();
    check(error);
    if (!card) throw new HttpError(404, "deckNotFound");
    const prev = card as CardRow;
    const next = schedule(prev, rating as Rating);
    const { data: saved, error: e2 } = await supabase
      .from("deck_cards")
      .update({ ...next, last_review_at: new Date().toISOString() })
      .eq("id", prev.id)
      .eq("user_id", userId)
      .select(CARD_FIELDS)
      .single();
    check(e2);
    await supabase.from("deck_review_log").insert({
      user_id: userId,
      deck_id: prev.deck_id,
      card_id: prev.id,
      rating,
      was_new: prev.state === "new",
    });
    res.json(withPreviews((await withImages([saved as CardRow]))[0]));
  }),
);
