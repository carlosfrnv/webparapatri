import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AiError } from "../ai";
import { userIdOf } from "../auth";
import { answerQuestion } from "../chatEngine";
import { asyncHandler } from "../http";
import { langOf, t } from "../i18n";
import { aiLimiter } from "../limits";
import { supabase } from "../supabase";

export const chatRouter = Router();

const chatSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  conversation_id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional(),
});

chatRouter.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const body = chatSchema.parse(req.body);
    const conversationId = body.conversation_id ?? randomUUID();

    // Últimas 6 mensagens, para conter o custo.
    const { data: recent } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(6);
    const history = (recent ?? [])
      .reverse()
      .map((m) => `${m.role === "user" ? (lang === "es" ? "Estudiante" : "Estudante") : "Tutor"}: ${m.content.slice(0, 1500)}`)
      .join("\n");

    await supabase.from("chat_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "user",
      content: body.question,
    });

    // Server-Sent Events: fontes primeiro, depois o texto aos bocadinhos.
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // As pesquisas web podem demorar: um "ping" mantém a ligação aberta.
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);

    try {
      const result = await answerQuestion({
        userId,
        lang,
        question: body.question,
        history,
        documentId: body.document_id,
        onMeta: ({ sources, tiers }) => send("meta", { conversation_id: conversationId, sources, tiers }),
        onText: (text) => send("delta", { text }),
        // O frontend mostra "A consultar…" e apaga qualquer preâmbulo: só conta a resposta final.
        onWebTool: (tool) => send("status", { phase: tool }),
      });
      // Guardamos a resposta gerada e os nomes/endereços das fontes. Nunca o texto das páginas web.
      await supabase.from("chat_messages").insert({
        user_id: userId,
        conversation_id: conversationId,
        role: "assistant",
        content: result.text,
        sources: result.sources,
      });
      send("done", { text: result.text, sources: result.sources, web_searches: result.webSearches });
    } catch (err) {
      console.error("Erro no chat:", err);
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
    // Uma entrada por conversa, com a primeira pergunta como título.
    const map = new Map<string, { conversation_id: string; title: string; updated_at: string }>();
    for (const m of data ?? []) {
      const existing = map.get(m.conversation_id);
      if (!existing) map.set(m.conversation_id, { conversation_id: m.conversation_id, title: m.content, updated_at: m.created_at });
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
    res.json(data ?? []);
  }),
);

chatRouter.delete(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", userIdOf(req))
      .eq("conversation_id", String(req.params.id));
    if (error) throw error;
    res.status(204).end();
  }),
);
