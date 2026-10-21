import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AiError } from "../ai";
import { userIdOf } from "../auth";
import { answerQuestion } from "../chatEngine";
import { OFF_TOPIC_MARKER } from "../prompts";
import { STORAGE_BUCKET } from "../config";
import { asyncHandler, HttpError } from "../http";
import { detectLang, langOf, t } from "../i18n";
import { aiLimiter } from "../limits";
import { supabase } from "../supabase";

export const chatRouter = Router();

export const MAX_IMAGES = 3;
const IMAGE_PREFIX = "chat";

/** Rutas de las fotos guardadas en los mensajes (van en "sources" como {kind: "image", path}). */
function imagePaths(sources: unknown): string[] {
  return Array.isArray(sources)
    ? sources.filter((s) => s?.kind === "image" && typeof s.path === "string").map((s) => s.path as string)
    : [];
}

// Fotos adjuntas (ejercicios, esquemas…): ya reducidas en el navegador, en base64.
const imageSchema = z.object({
  media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().max(4_000_000),
});

const chatSchema = z.object({
  question: z.string().trim().max(4000).default(""),
  images: z.array(imageSchema).max(MAX_IMAGES).default([]),
  conversation_id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional(),
  // Modo conversación (por voz): respuestas cortas y habladas.
  voice: z.boolean().default(false),
});

chatRouter.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = chatSchema.parse(req.body);
    // Contesta en el idioma en que escribe (si está claro); si no, en el idioma elegido en la web.
    const lang = (body.question && detectLang(body.question)) || langOf(req);
    if (!body.question && body.images.length === 0) throw new HttpError(400, "invalidData");
    const question = body.question || (lang === "es" ? "¿Me ayudas con esta foto?" : "Ajudas-me com esta foto?");
    const conversationId = body.conversation_id ?? randomUUID();

    // Las fotos se guardan en el almacenamiento privado para poder verlas en el historial.
    const imageSources: { kind: "image"; path: string }[] = [];
    for (const img of body.images) {
      const ext = img.media_type.split("/")[1].replace("jpeg", "jpg");
      const path = `${userId}/${IMAGE_PREFIX}/${conversationId}/${randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, Buffer.from(img.data, "base64"), { contentType: img.media_type });
      if (error) throw new HttpError(500, "saveFailed");
      imageSources.push({ kind: "image", path });
    }

    // Últimos 6 mensajes, para contener el coste.
    const { data: recent } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(6);
    const history = (recent ?? [])
      .reverse()
      .map((m) => {
        const content =
          m.content === OFF_TOPIC_MARKER
            ? lang === "es"
              ? "(pregunta ajena a los estudios)"
              : "(pergunta alheia aos estudos)"
            : m.content;
        return `${m.role === "user" ? (lang === "es" ? "Estudiante" : "Estudante") : "Tutor"}: ${content.slice(0, 1500)}`;
      })
      .join("\n");

    await supabase.from("chat_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "user",
      content: question,
      sources: imageSources.length ? imageSources : null,
    });

    // Server-Sent Events: primero las fuentes, luego el texto a trocitos.
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // Las búsquedas web pueden tardar: un "ping" mantiene la conexión abierta.
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);

    try {
      const result = await answerQuestion({
        userId,
        lang,
        question,
        images: body.images.map((i) => ({ mediaType: i.media_type, data: i.data })),
        history,
        documentId: body.document_id,
        voice: body.voice,
        onMeta: ({ sources, tiers }) => send("meta", { conversation_id: conversationId, sources, tiers }),
        onText: (text) => send("delta", { text }),
        // El frontend muestra "Buscando…" y borra cualquier preámbulo: solo cuenta la respuesta final.
        onWebTool: (tool) => send("status", { phase: tool }),
        // Un modelo ha fallado a mitad de respuesta y responde otro: la web borra el texto parcial.
        onReset: () => send("reset", {}),
      });
      // Guardamos la respuesta generada y los nombres/enlaces de las fuentes. Nunca el texto de las páginas web.
      await supabase.from("chat_messages").insert({
        user_id: userId,
        conversation_id: conversationId,
        role: "assistant",
        content: result.text,
        sources: result.sources,
      });
      send("done", { text: result.text, sources: result.sources, web_searches: result.webSearches });
    } catch (err) {
      console.error("Error en el chat:", err);
      send("error", { error: t(lang, err instanceof AiError ? err.key : "chatFailed") });
    } finally {
      clearInterval(keepAlive);
    }
    res.end();
  }),
);

chatRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("conversation_id, content, created_at")
      .eq("user_id", userIdOf(req))
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    // Una entrada por conversación, con la primera pregunta como título.
    const map = new Map<string, { conversation_id: string; title: string; updated_at: string }>();
    for (const m of data ?? []) {
      const existing = map.get(m.conversation_id);
      if (!existing)
        map.set(m.conversation_id, { conversation_id: m.conversation_id, title: m.content, updated_at: m.created_at });
      else existing.title = m.content;
    }
    res.json([...map.values()].slice(0, 30).map((c) => ({ ...c, title: c.title.slice(0, 80) })));
  }),
);

chatRouter.get(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, sources, created_at")
      .eq("user_id", userIdOf(req))
      .eq("conversation_id", String(req.params.id))
      .order("created_at");
    if (error) throw error;
    // Enlaces temporales (1 h) para ver las fotos de los mensajes.
    const paths = (data ?? []).flatMap((m) => imagePaths(m.sources));
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    res.json(
      (data ?? []).map((m) => ({
        ...m,
        sources: Array.isArray(m.sources)
          ? m.sources.map((s: { kind?: string; path?: string }) =>
              s?.kind === "image" ? { kind: "image", url: urls.get(s.path ?? "") ?? null } : s,
            )
          : m.sources,
      })),
    );
  }),
);

chatRouter.delete(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const { data: withImages } = await supabase
      .from("chat_messages")
      .select("sources")
      .eq("user_id", userIdOf(req))
      .eq("conversation_id", String(req.params.id))
      .eq("role", "user");
    const paths = (withImages ?? []).flatMap((m) => imagePaths(m.sources));
    if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", userIdOf(req))
      .eq("conversation_id", String(req.params.id));
    if (error) throw error;
    res.status(204).end();
  }),
);
