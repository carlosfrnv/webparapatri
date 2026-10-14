/**
 * SM-2 simplificado. quality: 0 (no lo sabía) … 5 (perfecto).
 * Devuelve la nueva facilidad, el intervalo en días y la fecha del próximo repaso.
 */
export function sm2(prev: { ease: number; interval_days: number }, quality: number) {
  let ease = prev.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ease = Math.max(1.3, Math.min(ease, 3.0));

  let interval: number;
  if (quality < 3) {
    interval = 0; // vuelve a aparecer hoy mismo
  } else if (prev.interval_days === 0) {
    interval = 1;
  } else if (prev.interval_days === 1) {
    interval = quality === 5 ? 4 : 3;
  } else {
    interval = Math.round(prev.interval_days * ease);
  }

  const due = new Date();
  if (interval === 0) due.setMinutes(due.getMinutes() + 10);
  else due.setDate(due.getDate() + interval);

  return { ease, interval_days: interval, due_at: due.toISOString() };
}
