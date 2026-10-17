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
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-5 p-4"
      style={{ background: "var(--hero)" }}
    >
      <div className="w-full max-w-md text-center text-white">
        <div className="mb-3 flex justify-center">
          <Logo size={64} />
        </div>
        <h1 className="text-3xl font-extrabold">{t.appName}</h1>
        <p className="mt-1 text-white/80">{t.auth.subtitle(dedicatoria.nombre)} 🖤</p>
      </div>
      <div className="card w-full max-w-md p-7 sm:p-8" style={{ boxShadow: "var(--shadow-lg)" }}>
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
      <LanguageSwitcher onDark />
    </main>
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6bff" />
          <stop offset="0.6" stopColor="#5b35f0" />
          <stop offset="1" stopColor="#12b3a5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#logo-g)" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#fff" strokeWidth="4" />
      <circle cx="32" cy="32" r="5" fill="#fff" />
      <path d="M32 10v7M32 47v7M10 32h7M47 32h7" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
