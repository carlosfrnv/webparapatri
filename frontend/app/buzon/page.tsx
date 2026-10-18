"use client";

import { EnvelopeSimpleOpen, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { type LoveNote, useRole } from "@/components/Couple";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { nombres } from "@/config/dedicatoria";
import { api, errorMessage } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";

export default function MailboxPage() {
  const t = useT();
  const tc = t.couple;
  const lang = useLang();
  const role = useRole();
  const [notes, setNotes] = useState<LoveNote[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setNotes(await api.get<LoveNote[]>("/couple/notes"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!notes || !role) return <Spinner label={t.common.loading} />;
  const partner = role === "partner";

  async function send() {
    setSending(true);
    try {
      const note = await api.post<LoveNote>("/couple/notes", { body: text.trim() });
      setNotes((list) => [note, ...(list ?? [])]);
      setText("");
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const when = (iso: string) => {
    const s = new Date(iso).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <>
      <PageHeader
        icon={EnvelopeSimpleOpen}
        title={tc.mailboxTitle}
        subtitle={partner ? tc.partnerSubtitle(nombres.ella) : tc.studentSubtitle(nombres.el)}
      />

      {partner && (
        <form
          className="card mb-8 space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send();
          }}
        >
          <label className="block">
            <span className="mb-1 block font-semibold">{tc.write(nombres.ella)}</span>
            <textarea
              className="input min-h-32"
              maxLength={1000}
              placeholder={tc.placeholder}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSent(false);
              }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={sending || !text.trim()}>
              {sending ? t.common.saving : tc.send}
            </button>
            {sent && <span className="text-success text-sm font-medium">{tc.sent}</span>}
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="card text-muted p-5">{tc.empty}</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="card p-5">
              <div className="text-muted flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{when(n.created_at)}</span>
                {partner && (
                  <span className="flex items-center gap-2">
                    <span className={n.read_at ? "text-success font-semibold" : ""}>
                      {n.read_at ? tc.read : tc.unread}
                    </span>
                    <button
                      className="btn-ghost text-danger min-h-8 px-2"
                      aria-label={t.common.delete}
                      onClick={async () => {
                        if (!confirm(tc.confirmDelete)) return;
                        await api.del(`/couple/notes/${n.id}`).catch(() => undefined);
                        setNotes((list) => list!.filter((x) => x.id !== n.id));
                      }}
                    >
                      <Trash size={16} weight="duotone" aria-hidden="true" />
                    </button>
                  </span>
                )}
              </div>
              <p className="mt-2 text-lg whitespace-pre-line">{n.body}</p>
              {!partner && <p className="mt-2 font-medium">— {nombres.el} 🖤</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
