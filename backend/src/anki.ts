/**
 * Programación de repasos como Anki (SM-2 de Anki): las tarjetas nuevas pasan por unos pasos de aprendizaje
 * (1 min, 10 min) antes de "graduarse"; luego el intervalo crece multiplicado por la facilidad. Si se olvida
 * una tarjeta ("Otra vez") vuelve a reaprendizaje y su facilidad baja.
 * Botones: 1 = Otra vez, 2 = Difícil, 3 = Bien, 4 = Fácil.
 */

export type CardState = "new" | "learning" | "review" | "relearning";
export type Rating = 1 | 2 | 3 | 4;

export interface Sched {
  state: CardState;
  step: number; // paso de aprendizaje en el que está
  interval_days: number;
  ease: number;
  lapses: number;
  reps: number;
  due_at: string;
}

const LEARN_STEPS = [1, 10]; // minutos
const RELEARN_STEPS = [10];
const GRADUATING_DAYS = 1;
const EASY_DAYS = 4;
const EASY_BONUS = 1.3;
const HARD_FACTOR = 1.2;
const MIN_EASE = 1.3;
const MAX_DAYS = 36500;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export function schedule(card: Sched, rating: Rating, now = new Date()): Sched {
  const t = now.getTime();
  const next: Sched = { ...card, reps: card.reps + 1 };
  const inMinutes = (m: number) => new Date(t + m * MIN).toISOString();
  const inDays = (d: number) => new Date(t + d * DAY).toISOString();
  const graduate = (days: number) => {
    next.state = "review";
    next.step = 0;
    next.interval_days = Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
    next.due_at = inDays(next.interval_days);
  };

  if (card.state === "new" || card.state === "learning") {
    next.state = "learning";
    const step = card.state === "new" ? 0 : card.step;
    if (rating === 1) {
      next.step = 0;
      next.due_at = inMinutes(LEARN_STEPS[0]);
    } else if (rating === 2) {
      // En el primer paso, "Difícil" es la media de los dos primeros (como en Anki).
      const m = step === 0 && LEARN_STEPS.length > 1 ? (LEARN_STEPS[0] + LEARN_STEPS[1]) / 2 : LEARN_STEPS[step];
      next.step = step;
      next.due_at = inMinutes(m);
    } else if (rating === 3) {
      if (step + 1 < LEARN_STEPS.length) {
        next.step = step + 1;
        next.due_at = inMinutes(LEARN_STEPS[step + 1]);
      } else graduate(GRADUATING_DAYS);
    } else graduate(EASY_DAYS);
    return next;
  }

  if (card.state === "relearning") {
    if (rating === 1) {
      next.step = 0;
      next.due_at = inMinutes(RELEARN_STEPS[0]);
    } else if (rating === 2) {
      next.due_at = inMinutes(RELEARN_STEPS[card.step] ?? RELEARN_STEPS[0]);
    } else if (rating === 3 && card.step + 1 < RELEARN_STEPS.length) {
      next.step = card.step + 1;
      next.due_at = inMinutes(RELEARN_STEPS[card.step + 1]);
    } else graduate(card.interval_days + (rating === 4 ? 1 : 0));
    return next;
  }

  // Repaso.
  const ivl = Math.max(1, card.interval_days);
  if (rating === 1) {
    next.lapses = card.lapses + 1;
    next.ease = Math.max(MIN_EASE, card.ease - 0.2);
    next.state = "relearning";
    next.step = 0;
    next.interval_days = 1; // al volver a saberla, empieza de nuevo con 1 día
    next.due_at = inMinutes(RELEARN_STEPS[0]);
    return next;
  }
  const hard = Math.max(ivl + 1, ivl * HARD_FACTOR);
  const good = Math.max(hard + 1, ivl * card.ease);
  const easy = Math.max(good + 1, ivl * card.ease * EASY_BONUS);
  if (rating === 2) next.ease = Math.max(MIN_EASE, card.ease - 0.15);
  if (rating === 4) next.ease = card.ease + 0.15;
  graduate(rating === 2 ? hard : rating === 3 ? good : easy);
  return next;
}

/** Cuánto tardaría en volver a salir con cada botón (segundos), para mostrarlo encima de ellos. */
export function previews(card: Sched, now = new Date()): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const r of [1, 2, 3, 4] as Rating[])
    out[r] = Math.round((new Date(schedule(card, r, now).due_at).getTime() - now.getTime()) / 1000);
  return out;
}
