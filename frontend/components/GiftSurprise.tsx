"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRole } from "@/components/Couple";
import { useDedicatoria } from "@/config/dedicatoria";
import { localToday } from "./ExamPlan";

// Fecha (AAAA-MM-DD) en que lo abrió. Mientras no esté, la caja sale al entrar.
const SEEN_KEY = "regalo-primor-visto";
// Días que se queda la tarjeta en el inicio después de abrirlo, para volver a verlo.
const KEEP_DAYS = 14;

const CONFETTI_COLORS = ["#db3f8c", "#f7c0da", "#fbbf24", "#ffffff", "#b02e70", "#34d6c6"];

// Números "aleatorios" fijos (siempre los mismos), para que el confeti no cambie en cada render.
function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const CONFETTI = Array.from({ length: 70 }, (_, i) => ({
  left: seeded(i) * 100,
  delay: seeded(i + 100) * 0.8,
  duration: 2.4 + seeded(i + 200) * 2,
  drift: (seeded(i + 300) - 0.5) * 160,
  spin: 360 + seeded(i + 400) * 720,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  round: i % 3 === 0,
}));

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function daysSince(date: string, today: string) {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

/**
 * Sorpresa de la tarjeta regalo: la primera vez que entra sale una caja que tiene que tocar;
 * se abre con confeti y aparece la tarjeta con el mensaje. Luego queda unos días en el inicio.
 * Solo la ve ella (Carlos puede verla con ?regalo en la dirección, sin que cuente como vista).
 */
export function GiftSurprise({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const r = useDedicatoria().regalo;
  const role = useRole();
  const today = localToday();
  const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("regalo");
  const [seen, setSeen] = useState(readSeen);
  // null = todavía no ha tocado nada: la caja sale sola si no lo ha abierto nunca.
  const [chosen, setPhase] = useState<"closed" | "box" | "opening" | "open" | null>(null);

  const isHer = role === "student";
  const show = (isHer && (!seen || daysSince(seen, today) < KEEP_DAYS)) || preview;
  const phase = chosen ?? ((isHer && !seen) || preview ? "box" : "closed");

  useEffect(() => {
    onOpenChange?.(phase !== "closed");
  }, [phase, onOpenChange]);

  useEffect(() => {
    if (phase !== "opening") return;
    const id = setTimeout(() => setPhase("open"), 900);
    return () => clearTimeout(id);
  }, [phase]);

  if (!show) return null;

  function close() {
    setPhase("closed");
    if (!isHer || seen) return;
    try {
      localStorage.setItem(SEEN_KEY, today);
    } catch {
      /* se ignora */
    }
    setSeen(today);
  }

  return (
    <>
      {seen && (
        <button
          className="card card-hover mb-8 flex w-full items-center gap-4 p-5 text-left"
          onClick={() => setPhase("open")}
        >
          <span className="text-4xl" aria-hidden="true">
            🎁
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{r.volver}</span>
            <span className="text-muted block text-sm">{r.volverTexto}</span>
          </span>
        </button>
      )}

      {/* Se pinta directamente en <body> para que tape toda la web (menú y barra de arriba incluidos). */}
      {phase !== "closed" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={r.aviso}
          >
            {phase === "open" && (
              <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                {CONFETTI.map((c, i) => (
                  <span
                    key={i}
                    className="confetti"
                    style={
                      {
                        left: `${c.left}%`,
                        background: c.color,
                        borderRadius: c.round ? "9999px" : "2px",
                        animationDelay: `${c.delay}s`,
                        animationDuration: `${c.duration}s`,
                        "--drift": `${c.drift}px`,
                        "--spin": `${c.spin}deg`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            )}

            {phase !== "open" ? (
              <button
                className="flex flex-col items-center gap-6 text-white"
                onClick={() => setPhase("opening")}
                disabled={phase === "opening"}
              >
                <span className="text-2xl font-bold drop-shadow sm:text-3xl">{r.aviso}</span>
                <span className={`gift-box ${phase === "opening" ? "gift-opening" : "gift-wiggle"}`} aria-hidden="true">
                  <span className="gift-lid">
                    <span className="gift-bow">🎀</span>
                  </span>
                  <span className="gift-body" />
                </span>
                <span className={`text-white/85 transition-opacity ${phase === "opening" ? "opacity-0" : ""}`}>
                  {r.tocar}
                </span>
              </button>
            ) : (
              <div className="gift-reveal card relative my-auto w-full max-w-md p-6 text-center shadow-xl sm:p-8">
                <div className="gift-card mx-auto">
                  <div className="flex items-start justify-between">
                    <span className="text-[0.7rem] font-semibold tracking-[0.25em] text-white/70 uppercase">
                      {r.tarjeta}
                    </span>
                    <span aria-hidden="true">🖤</span>
                  </div>
                  <div className="gift-card-brand">PRIMOR</div>
                  <div className="text-sm text-white/80">{r.para}</div>
                </div>
                <h2 className="mt-6 text-2xl font-bold">{r.titulo}</h2>
                <p className="text-muted mt-3 text-left whitespace-pre-line sm:text-center">{r.mensaje}</p>
                <p className="mt-4 font-medium">{r.firma}</p>
                <button className="btn-primary mt-6 w-full" onClick={close} autoFocus>
                  {r.cerrar}
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
