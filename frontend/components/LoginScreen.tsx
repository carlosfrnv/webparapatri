"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { dedicatoria } from "@/config/dedicatoria";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) {
      setError(
        error.status === 429
          ? "Pediste muitos links seguidos. Espera um minuto e tenta outra vez."
          : "Não foi possível enviar o link. Confirma que este é o email com acesso à web.",
      );
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold">Estudo IMR</h1>
            <p className="text-muted text-sm">O teu espaço de estudo, {dedicatoria.nome}</p>
          </div>
        </div>

        {state === "sent" ? (
          <div className="bg-success-soft rounded-xl p-4">
            <p className="font-medium">Verifica o teu email 📬</p>
            <p className="mt-1 text-sm">
              Enviámos um link para <strong>{email}</strong>. Abre-o neste dispositivo para entrares.
            </p>
            <button className="btn-ghost mt-3 px-0" onClick={() => setState("idle")}>
              Usar outro email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Email</span>
              <input
                className="input"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="o.teu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {state === "error" && <p className="bg-danger-soft rounded-xl p-3 text-sm">{error}</p>}
            <button className="btn-primary w-full" disabled={state === "sending"}>
              {state === "sending" ? "A enviar…" : "Receber link de entrada"}
            </button>
            <p className="text-muted text-center text-xs">
              Sem palavra-passe: basta clicares no link que vais receber.
            </p>
          </form>
        )}
      </div>
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
