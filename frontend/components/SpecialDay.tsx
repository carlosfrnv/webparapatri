"use client";

import { useState } from "react";
import { fechas, useDedicatoria } from "@/config/dedicatoria";
import { localToday } from "./ExamPlan";

interface Special {
  emoji: string;
  title: string;
  text: string;
}

/** Mensaje del día si hoy es una fecha especial (el 21 de cada mes, el aniversario o el 8 de octubre). */
function useSpecialToday(today: string): Special | null {
  const d = useDedicatoria().especial;
  const [y, m, day] = today.split("-").map(Number);

  const [ny, nm, nd] = fechas.novios.split("-").map(Number);
  if (day === nd) {
    const months = (y - ny) * 12 + (m - nm);
    if (months > 0 && months % 12 === 0)
      return { emoji: "🎉", title: d.tituloAniversario, text: d.aniversario(months / 12) };
    if (months > 0)
      return { emoji: "💌", title: d.tituloMes(months), text: d.mes[(months - 1) % d.mes.length](months) };
  }

  const [by, bm, bd] = fechas.primerBeso.split("-").map(Number);
  if (m === bm && day === bd && y > by) return { emoji: "💋", title: d.tituloBeso, text: d.beso(y - by) };
  return null;
}

const SEEN_KEY = "especial-visto";

/**
 * En los días especiales: la primera vez que entra ese día sale una carta en grande,
 * y durante todo el día queda una tarjeta en la página de inicio para volver a leerla.
 */
export function SpecialDay({ suppressModal = false }: { suppressModal?: boolean }) {
  const today = localToday();
  const special = useSpecialToday(today);
  const firma = useDedicatoria().especial.firma;
  const cerrar = useDedicatoria().especial.cerrar;
  // Esta página solo se pinta en el navegador (después del login), así que podemos leer el localStorage.
  const [open, setOpen] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(SEEN_KEY) !== today;
    } catch {
      return false;
    }
  });

  if (!special) return null;

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, today);
    } catch {
      /* se ignora */
    }
  }

  return (
    <>
      <button
        className="card card-hover mb-8 flex w-full items-center gap-4 p-5 text-left"
        onClick={() => setOpen(true)}
      >
        <span className="text-4xl" aria-hidden="true">
          {special.emoji}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{special.title}</span>
          <span className="text-muted line-clamp-2 block text-sm">{special.text}</span>
        </span>
      </button>

      {open && !suppressModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="special-title"
        >
          <div className="card max-w-lg p-8 text-center shadow-xl">
            <div className="text-5xl" aria-hidden="true">
              {special.emoji}
            </div>
            <h2 id="special-title" className="mt-3 text-2xl font-bold">
              {special.title}
            </h2>
            <p className="text-muted mt-4 whitespace-pre-line">{special.text}</p>
            <p className="mt-4 font-medium">{firma}</p>
            <button className="btn-primary mt-6 w-full" onClick={close} autoFocus>
              {cerrar}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
