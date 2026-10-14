"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDedicatoria } from "@/config/dedicatoria";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<"rateLimited" | "sendFailed">("sendFailed");
  const t = useT();
  const dedicatoria = useDedicatoria();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) {
      setError(error.status === 429 ? "rateLimited" : "sendFailed");
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <div className="card w-full max-w-md p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold">{t.appName}</h1>
            <p className="text-muted text-sm">{t.auth.subtitle(dedicatoria.nombre)}</p>
          </div>
        </div>

        {state === "sent" ? (
          <div className="bg-success-soft rounded-xl p-4">
            <p className="font-medium">{t.auth.checkEmail}</p>
            <p className="mt-1 text-sm">
              {t.auth.sentTo} <strong>{email}</strong>. {t.auth.openOnDevice}
            </p>
            <button className="btn-ghost mt-3 px-0" onClick={() => setState("idle")}>
              {t.auth.otherEmail}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t.auth.email}</span>
              <input
                className="input"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {state === "error" && <p className="bg-danger-soft rounded-xl p-3 text-sm">{t.auth[error]}</p>}
            <button className="btn-primary w-full" disabled={state === "sending"}>
              {state === "sending" ? t.auth.sending : t.auth.send}
            </button>
            <p className="text-muted text-center text-xs">{t.auth.noPassword}</p>
          </form>
        )}
      </div>
      <LanguageSwitcher />
    </main>
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="var(--accent-contrast)" strokeWidth="4" />
      <circle cx="32" cy="32" r="5" fill="var(--accent-contrast)" />
      <path
        d="M32 10v7M32 47v7M10 32h7M47 32h7"
        stroke="var(--accent-contrast)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
