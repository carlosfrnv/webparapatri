"use client";

import type { Icon } from "@phosphor-icons/react";

export type Tone = "violet" | "teal" | "pink" | "amber" | "blue" | "slate";

// Degradado de cada color (de arriba a la izquierda hacia abajo a la derecha) y su brillo.
const TONES: Record<Tone, { bg: string; glow: string }> = {
  violet: { bg: "linear-gradient(135deg, #a18bff 0%, #6d4aff 55%, #4b2bd6 100%)", glow: "rgb(109 74 255 / 0.45)" },
  teal: { bg: "linear-gradient(135deg, #5eead4 0%, #14b8a6 55%, #0b8f84 100%)", glow: "rgb(20 184 166 / 0.45)" },
  pink: { bg: "linear-gradient(135deg, #f9a8d4 0%, #ec4899 55%, #c2257a 100%)", glow: "rgb(236 72 153 / 0.45)" },
  amber: { bg: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 55%, #d97706 100%)", glow: "rgb(245 158 11 / 0.45)" },
  blue: { bg: "linear-gradient(135deg, #93c5fd 0%, #3b82f6 55%, #1d4ed8 100%)", glow: "rgb(59 130 246 / 0.45)" },
  slate: { bg: "linear-gradient(135deg, #c4c0dc 0%, #8b84b0 55%, #615a8a 100%)", glow: "rgb(97 90 138 / 0.4)" },
};

/** Icono blanco "duotono" sobre un cuadradito con degradado y brillo, estilo app. */
export function GradientIcon({
  icon: IconCmp,
  tone = "violet",
  size = 44,
}: {
  icon: Icon;
  tone?: Tone;
  size?: number;
}) {
  const t = TONES[tone];
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-[30%] text-white"
      style={{
        width: size,
        height: size,
        background: t.bg,
        boxShadow: `0 8px 18px -8px ${t.glow}, inset 0 1px 0 rgb(255 255 255 / 0.35)`,
      }}
      aria-hidden="true"
    >
      <IconCmp size={Math.round(size * 0.55)} weight="duotone" />
    </span>
  );
}
