import {
  Atom,
  Brain,
  ChartLineUp,
  Flask,
  HandHeart,
  Heartbeat,
  Radioactive,
  Scan,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import type { Area, Subject } from "@/lib/types";
import type { Tone } from "./GradientIcon";

// Icono propio para las asignaturas conocidas (por palabras del nombre, en español o portugués).
const SUBJECT_ICONS: { match: RegExp; icon: Icon; tone: Tone }[] = [
  { match: /anatom/i, icon: Heartbeat, tone: "pink" },
  { match: /f[ií]sica/i, icon: Atom, tone: "violet" },
  { match: /bioqu[ií]m/i, icon: Flask, tone: "teal" },
  { match: /matem|estad[ií]st|estat[ií]st/i, icon: ChartLineUp, tone: "amber" },
  { match: /imag/i, icon: Scan, tone: "blue" },
  { match: /psico/i, icon: Brain, tone: "violet" },
  { match: /volunt|identid/i, icon: HandHeart, tone: "pink" },
  { match: /radioter/i, icon: Radioactive, tone: "amber" },
];

export function subjectLook(s: Subject): { icon: Icon; tone: Tone; bar: string } {
  const area = AREA_STYLE[s.area ?? "transversal"];
  const own = SUBJECT_ICONS.find((x) => x.match.test(s.name));
  return own ? { icon: own.icon, tone: own.tone, bar: TONE_BAR[own.tone] } : { ...area, bar: area.bar };
}

const TONE_BAR: Record<Tone, string> = {
  violet: "bg-[#6d4aff]",
  teal: "bg-[#14b8a6]",
  pink: "bg-[#ec4899]",
  amber: "bg-[#f59e0b]",
  blue: "bg-[#3b82f6]",
  slate: "bg-[#8b84b0]",
};

// Color e icono de cada área (barra superior y cuadradito de la tarjeta de la asignatura).
const AREA_STYLE: Record<Area, { bar: string; tone: Tone; icon: Icon }> = {
  base: { bar: "bg-[#6d4aff]", tone: "violet", icon: Atom },
  radiologia: { bar: "bg-[#14b8a6]", tone: "teal", icon: Scan },
  medicina_nuclear: { bar: "bg-[#f59e0b]", tone: "amber", icon: Radioactive },
  radioterapia: { bar: "bg-[#ec4899]", tone: "pink", icon: Heartbeat },
  transversal: { bar: "bg-[#3b82f6]", tone: "blue", icon: UsersThree },
};
