"use client";

import {
  BookBookmark,
  Brain,
  CalendarBlank,
  ChatCircleDots,
  House,
  Moon,
  SignOut,
  Sun,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useDedicatoria } from "@/config/dedicatoria";
import { onServerWaking } from "@/lib/api";
import { type Dictionary, useT } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./LoginScreen";

const NAV: { href: string; key: keyof Dictionary["nav"]; icon: Icon }[] = [
  { href: "/", key: "home", icon: House },
  { href: "/biblioteca", key: "library", icon: BookBookmark },
  { href: "/estudiar", key: "study", icon: Brain },
  { href: "/calendario", key: "calendar", icon: CalendarBlank },
  { href: "/chat", key: "chat", icon: ChatCircleDots },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/biblioteca") return ["/biblioteca", "/asignatura", "/documento"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function ThemeToggle({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const t = useT();
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
      /* almacenamiento no disponible */
    }
  }
  const ModeIcon = dark ? Sun : Moon;
  return (
    <button
      className={`btn ${onDark ? "text-white/75 hover:bg-white/10 hover:text-white" : "btn-ghost"} ${className}`}
      onClick={toggle}
      aria-label={dark ? t.nav.toLight : t.nav.toDark}
    >
      <ModeIcon size={20} weight="duotone" aria-hidden="true" />
      <span className="hidden lg:inline">{dark ? t.nav.lightMode : t.nav.darkMode}</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [waking, setWaking] = useState(false);
  const t = useT();
  const dedicatoria = useDedicatoria();
  useEffect(() => onServerWaking(setWaking), []);

  return (
    <div className="min-h-dvh md:flex">
      {/* Barra lateral (ordenador) */}
      <aside
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col p-4 text-white md:flex"
        style={{ background: "var(--sidebar)" }}
      >
        <Link href="/" className="mb-8 flex items-center gap-3 px-2 pt-1">
          <Logo size={40} />
          <div className="leading-tight">
            <span className="font-display block text-lg font-extrabold">{t.appName}</span>
            <span className="text-xs text-white/60">{t.nav.tagline}</span>
          </div>
        </Link>
        <nav className="flex flex-col gap-1" aria-label={t.nav.mainNav}>
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const NavIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-all ${
                  active
                    ? "bg-white text-[#2a1a6e] shadow-lg shadow-black/20"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <NavIcon size={22} weight={active ? "fill" : "duotone"} aria-hidden="true" />
                {t.nav[item.key]}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#ef5da8] to-[#6d4aff] text-lg font-bold">
                {dedicatoria.nombre.charAt(0)}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate font-semibold">{dedicatoria.nombre} 🖤</p>
                <p className="truncate text-xs text-white/60">{t.nav.student}</p>
              </div>
            </div>
          </div>
          <LanguageSwitcher onDark />
          <div className="flex gap-1">
            <ThemeToggle onDark className="flex-1 justify-start" />
            <button
              className="btn px-3 text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => supabase.auth.signOut()}
              aria-label={t.nav.logout}
              title={t.nav.logout}
            >
              <SignOut size={20} weight="duotone" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera (móvil) */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 text-white md:hidden"
          style={{ background: "var(--sidebar)" }}
        >
          <Link href="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-display font-extrabold">{t.appName}</span>
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact onDark />
            <ThemeToggle onDark className="px-2" />
            <button
              className="btn px-2 text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => supabase.auth.signOut()}
              aria-label={t.nav.logout}
            >
              <SignOut size={20} weight="duotone" aria-hidden="true" />
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
            {t.nav.waking}
          </div>
        )}

        <main className="fade-up mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-8 md:pt-10 md:pb-12">
          {children}
        </main>
      </div>

      {/* Barra inferior (móvil) */}
      <nav
        className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label={t.nav.mainNav}
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const NavIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span
                className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-accent-soft" : ""
                }`}
              >
                <NavIcon size={22} weight={active ? "fill" : "duotone"} aria-hidden="true" />
              </span>
              {t.nav[item.key]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
