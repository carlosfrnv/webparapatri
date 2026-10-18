"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nombres } from "@/config/dedicatoria";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export type Role = "student" | "partner";

export interface LoveNote {
  id: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** Quién está usando la web: ella ("student") o Carlos ("partner"). */
export function useRole() {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    api
      .get<{ role: Role }>("/couple/me")
      .then((r) => setRole(r.role))
      .catch(() => setRole("student"));
  }, []);
  return role;
}

/** En el inicio de ella: las notas nuevas de Carlos, en grande, hasta que las guarda. */
export function NewNotes() {
  const t = useT();
  const tc = t.couple;
  const [notes, setNotes] = useState<LoveNote[]>([]);

  useEffect(() => {
    api
      .get<LoveNote[]>("/couple/notes")
      .then((list) => setNotes(list.filter((n) => !n.read_at).reverse()))
      .catch(() => undefined);
  }, []);

  if (notes.length === 0) return null;
  const note = notes[0];

  return (
    <section className="card relative mb-8 overflow-hidden border-2 border-[var(--accent)] p-6 sm:p-8" role="status">
      <p className="text-accent text-sm font-bold">{tc.newNote(nombres.el)}</p>
      <p className="font-display mt-3 text-xl leading-relaxed font-semibold whitespace-pre-line sm:text-2xl">
        {note.body}
      </p>
      <p className="mt-3 font-medium">— {nombres.el} 🖤</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          onClick={() => {
            api.post(`/couple/notes/${note.id}/read`).catch(() => undefined);
            setNotes((list) => list.slice(1));
          }}
        >
          {tc.keep}
        </button>
        {notes.length > 1 && <span className="text-muted text-sm">+{notes.length - 1} 💌</span>}
        <Link href="/buzon" className="text-accent text-sm font-semibold">
          {tc.seeAll}
        </Link>
      </div>
    </section>
  );
}
