"use client";

import { LANGS, setLang, useLang, useT } from "@/lib/i18n";

/** Selector de idioma: español / português. */
export function LanguageSwitcher({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  const lang = useLang();
  const t = useT();
  return (
    <div
      className={`flex gap-1 rounded-xl p-1 ${onDark ? "side-card" : "bg-surface-2"}`}
      role="group"
      aria-label={t.nav.language}
    >
      {LANGS.map((l) => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          lang={l.id}
          title={l.label}
          className={`min-h-9 flex-1 rounded-lg px-2 text-sm font-medium whitespace-nowrap ${
            lang === l.id
              ? onDark
                ? "side-active"
                : "bg-surface text-text shadow-sm"
              : onDark
                ? "side-link"
                : "text-muted hover:text-text"
          }`}
        >
          <span aria-hidden="true">{l.flag}</span> {compact ? l.id.toUpperCase() : l.label}
        </button>
      ))}
    </div>
  );
}
