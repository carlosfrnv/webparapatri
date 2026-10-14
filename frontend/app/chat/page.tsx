"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localSourceHref, SourceChips } from "@/components/Sources";
import { Markdown } from "@/components/ui";
import { apiFetch, api, errorMessage } from "@/lib/api";
import { dict, useT } from "@/lib/i18n";
import { useDedicatoria } from "@/config/dedicatoria";
import { isLocalSource, OFF_TOPIC_MARKER, type AnySource, type ChatMessage, type DocumentItem } from "@/lib/types";

interface Conversation {
  conversation_id: string;
  title: string;
  updated_at: string;
}

type WebPhase = "web_search" | "web_fetch";

/** Lee el stream SSE del backend (event: meta | delta | status | done | error). */
async function streamChat(
  body: { question: string; conversation_id?: string; document_id?: string },
  handlers: {
    meta: (d: { conversation_id: string; sources: AnySource[] }) => void;
    delta: (t: string) => void;
    status: (phase: WebPhase) => void;
    reset: () => void;
    done: (d: { text: string; sources: AnySource[] }) => void;
  },
) {
  const res = await apiFetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? dict().chat.failed);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = raw.match(/^event: (.*)$/m)?.[1];
      const dataLine = raw.match(/^data: (.*)$/m)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === "meta") handlers.meta(data);
      else if (event === "delta") handlers.delta(data.text);
      else if (event === "status") handlers.status(data.phase);
      else if (event === "reset") handlers.reset();
      else if (event === "done") handlers.done(data);
      else if (event === "error") throw new Error(data.error);
    }
  }
}

export default function ChatPage() {
  const t = useT();
  const dedicatoria = useDedicatoria();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [docFilter, setDocFilter] = useState<DocumentItem | null>(null);
  const [webPhase, setWebPhase] = useState<WebPhase | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    api
      .get<Conversation[]>("/chat/conversations")
      .then(setConversations)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadConversations();
    const docId = window.location.hash.match(/doc=([0-9a-f-]{36})/)?.[1];
    if (docId)
      api
        .get<DocumentItem>(`/documents/${docId}`)
        .then(setDocFilter)
        .catch(() => undefined);
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function openConversation(id: string) {
    setShowHistory(false);
    setError("");
    try {
      const msgs = await api.get<ChatMessage[]>(`/chat/conversations/${id}`);
      setMessages(msgs);
      setConversationId(id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function newConversation() {
    setMessages([]);
    setConversationId(undefined);
    setShowHistory(false);
    setError("");
  }

  async function deleteConversation(id: string) {
    if (!confirm(t.chat.confirmDelete)) return;
    await api.del(`/chat/conversations/${id}`).catch(() => undefined);
    if (id === conversationId) newConversation();
    loadConversations();
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", sources: [] }]);

    const updateLast = (fn: (msg: ChatMessage) => ChatMessage) =>
      setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);

    try {
      await streamChat(
        { question, conversation_id: conversationId, document_id: docFilter?.id },
        {
          meta: ({ conversation_id, sources }) => {
            setConversationId(conversation_id);
            updateLast((msg) => ({ ...msg, sources }));
          },
          delta: (t) => {
            setWebPhase(null);
            updateLast((msg) => ({ ...msg, content: msg.content + t }));
          },
          // La IA ha empezado a consultar la web: mostramos el estado y borramos cualquier preámbulo.
          status: (phase) => {
            setWebPhase(phase);
            updateLast((msg) => ({ ...msg, content: "" }));
          },
          // Un modelo ha fallado a mitad de respuesta y contesta otro: borramos el texto parcial.
          reset: () => updateLast((msg) => ({ ...msg, content: "" })),
          // Respuesta final (solo el texto después de las búsquedas) y todas las fuentes, incluidas las web.
          done: ({ text, sources }) => updateLast((msg) => ({ ...msg, content: text || msg.content, sources })),
        },
      );
      loadConversations();
    } catch (err) {
      setError(errorMessage(err));
      setMessages((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)));
    } finally {
      setBusy(false);
      setWebPhase(null);
    }
  }

  const historyPanel = (
    <div className="flex flex-col gap-1">
      <button className="btn-primary mb-2" onClick={newConversation}>
        {t.chat.newConversation}
      </button>
      {conversations.length === 0 && <p className="text-muted p-2 text-sm">{t.chat.noConversations}</p>}
      {conversations.map((c) => (
        <div key={c.conversation_id} className="group flex items-center">
          <button
            onClick={() => openConversation(c.conversation_id)}
            className={`min-h-11 flex-1 truncate rounded-lg px-3 text-left text-sm ${
              c.conversation_id === conversationId ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
            }`}
          >
            {c.title}
          </button>
          <button
            className="btn-ghost min-h-9 px-2 text-sm"
            onClick={() => deleteConversation(c.conversation_id)}
            aria-label={t.chat.deleteConversation}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex gap-6">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-6">{historyPanel}</div>
      </aside>

      <div className="flex min-h-[calc(100dvh-12rem)] min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{t.chat.title}</h1>
          <div className="flex gap-2 lg:hidden">
            <button className="btn-secondary" onClick={() => setShowHistory((s) => !s)}>
              {t.chat.conversations}
            </button>
            <button className="btn-secondary" onClick={newConversation} aria-label={t.chat.newConversationLabel}>
              ＋
            </button>
          </div>
        </div>

        {showHistory && <div className="card mb-4 p-3 lg:hidden">{historyPanel}</div>}

        {docFilter && (
          <div className="bg-accent-soft mb-4 flex items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm">
            <span className="truncate">
              {t.chat.onlyWith} <strong>{docFilter.title}</strong>
            </span>
            <button
              className="btn-ghost min-h-9 px-2"
              onClick={() => {
                setDocFilter(null);
                window.history.replaceState(null, "", "/chat");
              }}
            >
              {t.chat.useAll}
            </button>
          </div>
        )}

        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-4xl" aria-hidden="true">
                💬
              </p>
              <p className="mt-2 text-lg font-semibold">{t.chat.emptyTitle}</p>
              <p className="text-muted mt-1">{t.chat.emptyText}</p>
              <div className="mt-5 flex flex-col gap-2">
                {t.chat.suggestions.map((s) => (
                  <button key={s} className="btn-secondary justify-start text-left text-sm" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-accent text-accent-contrast max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="card max-w-[95%] rounded-bl-md px-4 py-3 sm:max-w-[85%]">
                  {m.content.trim() === OFF_TOPIC_MARKER ? (
                    <p className="whitespace-pre-wrap">{dedicatoria.fueraDeTema}</p>
                  ) : m.content ? (
                    <Markdown
                      citeHref={(n) => {
                        const s = m.sources?.filter(isLocalSource).find((x) => x.n === n);
                        return s ? localSourceHref(s) : undefined;
                      }}
                    >
                      {m.content}
                    </Markdown>
                  ) : webPhase && i === messages.length - 1 ? (
                    <span className="text-muted flex items-center gap-2 py-2 text-sm" role="status">
                      <span
                        className="border-border border-t-accent h-4 w-4 animate-spin rounded-full border-2"
                        aria-hidden="true"
                      />
                      🌐 {t.sources.searching[webPhase]}
                    </span>
                  ) : (
                    <span className="flex gap-1 py-2" aria-label={t.chat.typing}>
                      <span className="bg-muted h-2 w-2 animate-bounce rounded-full" />
                      <span className="bg-muted h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
                      <span className="bg-muted h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
                    </span>
                  )}
                  {m.sources && m.content && m.content.trim() !== OFF_TOPIC_MARKER && <SourceChips sources={m.sources} />}
                </div>
              </div>
            ),
          )}
          {error && <p className="bg-danger-soft rounded-xl p-3 text-sm">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-border bg-surface sticky bottom-20 mt-4 flex items-end gap-2 rounded-2xl border p-2 shadow-sm md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
            rows={1}
            placeholder={t.chat.placeholder}
            aria-label={t.chat.inputLabel}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button className="btn-primary" disabled={busy || !input.trim()} aria-label={t.chat.send}>
            {busy ? "…" : t.chat.send}
          </button>
        </form>
      </div>
    </div>
  );
}
