"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDedicatoria } from "@/config/dedicatoria";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<"rateLimited" | "wrongCredentials" | "loginFailed">("loginFailed");
  const t = useT();
  const dedicatoria = useDedicatoria();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    // Al entrar, AuthGate detecta la sesión y muestra la web. La sesión queda guardada en el navegador.
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.status === 429 ? "rateLimited" : error.status === 400 ? "wrongCredentials" : "loginFailed");
      setState("error");
    } else {
      setState("idle");
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
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t.auth.password}</span>
            <div className="flex gap-2">
              <input
                className="input min-w-0 flex-1"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost px-3"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                aria-pressed={showPassword}
              >
                <span aria-hidden="true">{showPassword ? "🙈" : "👁️"}</span>
              </button>
            </div>
          </label>
          {state === "error" && <p className="bg-danger-soft rounded-xl p-3 text-sm">{t.auth[error]}</p>}
          <button className="btn-primary w-full" disabled={state === "sending"}>
            {state === "sending" ? t.auth.sending : t.auth.send}
          </button>
          <p className="text-muted text-center text-xs">{t.auth.remember}</p>
        </form>
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
