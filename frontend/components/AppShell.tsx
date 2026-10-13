"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onServerWaking } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Logo } from "./LoginScreen";

const NAV = [
  { href: "/", label: "Início", icon: "🏠" },
  { href: "/biblioteca", label: "Biblioteca", icon: "📚" },
  { href: "/estudar", label: "Estudar", icon: "🧠" },
  { href: "/chat", label: "Chat", icon: "💬" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/biblioteca") return ["/biblioteca", "/disciplina", "/documento"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* armazenamento indisponível */
    }
  }
  return (
    <button
      className="btn-ghost"
      onClick={toggle}
      aria-label={dark ? "Mudar para modo claro" : "Mudar para modo escuro"}
    >
      <span aria-hidden="true">{dark ? "☀️" : "🌙"}</span>
      <span className="hidden lg:inline">{dark ? "Modo claro" : "Modo escuro"}</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [waking, setWaking] = useState(false);
  useEffect(() => onServerWaking(setWaking), []);

  return (
    <div className="min-h-dvh md:flex">
      {/* Barra lateral (computador) */}
      <aside className="border-border bg-surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r p-4 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2">
          <Logo size={36} />
          <span className="text-lg font-bold">Estudo IMR</span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Navegação principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors ${
                isActive(pathname, item.href)
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <ThemeToggle />
          <button className="btn-ghost justify-start" onClick={() => supabase.auth.signOut()}>
            <span aria-hidden="true">🚪</span> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo (telemóvel) */}
        <header className="border-border bg-surface/90 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-2 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={30} />
            <span className="font-bold">Estudo IMR</span>
          </Link>
          <div className="flex">
            <ThemeToggle />
            <button className="btn-ghost" onClick={() => supabase.auth.signOut()} aria-label="Sair">
              🚪
            </button>
          </div>
        </header>

        {waking && (
          <div
            className="bg-warning-soft sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-2 text-sm"
            role="status"
          >
            <span
              className="border-border border-t-accent h-4 w-4 animate-spin rounded-full border-2"
              aria-hidden="true"
            />
            A acordar o servidor… (pode demorar até um minuto)
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-10">{children}</main>
      </div>

      {/* Barra inferior (telemóvel) */}
      <nav
        className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navegação principal"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center text-xs font-medium ${
              isActive(pathname, item.href) ? "text-accent" : "text-muted"
            }`}
          >
            <span className="text-xl" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
