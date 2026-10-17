"use client";

import { useState } from "react";
import { dateLocale, useLang, useT } from "@/lib/i18n";

/** Barras de los repasos de los últimos 7 días (una sola serie: sin leyenda, el título la nombra). */
export function WeekChart({ week }: { week: { date: string; count: number }[] }) {
  const t = useT();
  const lang = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...week.map((d) => d.count));
  const label = (iso: string, style: "narrow" | "long") =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: style });

  return (
    <figure className="m-0">
      <div className="relative flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label={t.home.weekTitle}>
        {/* Líneas de guía discretas */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="border-border w-full border-t border-dashed" />
          ))}
        </div>
        {week.map((d, i) => {
          const isToday = i === week.length - 1;
          const h = d.count === 0 ? 3 : Math.max(8, (d.count / max) * 100);
          return (
            <div
              key={d.date}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${label(d.date, "long")}: ${d.count}`}
            >
              {hover === i && (
                <span className="bg-text text-surface absolute -top-9 z-10 rounded-lg px-2 py-1 text-xs font-semibold whitespace-nowrap shadow-lg">
                  {label(d.date, "long")}: {d.count}
                </span>
              )}
              <span
                className="w-full max-w-9 rounded-t-[4px] transition-all duration-500"
                style={{
                  height: `${h}%`,
                  background: isToday
                    ? "linear-gradient(180deg, color-mix(in oklab, var(--accent) 70%, white) 0%, var(--accent) 100%)"
                    : d.count === 0
                      ? "var(--surface-2)"
                      : "linear-gradient(180deg, color-mix(in oklab, var(--accent) 40%, transparent) 0%, color-mix(in oklab, var(--accent) 22%, transparent) 100%)",
                  opacity: hover === null || hover === i ? 1 : 0.6,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3" aria-hidden="true">
        {week.map((d, i) => (
          <span
            key={d.date}
            className={`flex-1 text-center text-xs capitalize ${i === week.length - 1 ? "text-accent font-bold" : "text-muted"}`}
          >
            {label(d.date, "narrow")}
          </span>
        ))}
      </div>
      {/* Tabla para lectores de pantalla */}
      <table className="sr-only">
        <caption>{t.home.weekTitle}</caption>
        <tbody>
          {week.map((d) => (
            <tr key={d.date}>
              <th scope="row">{label(d.date, "long")}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
