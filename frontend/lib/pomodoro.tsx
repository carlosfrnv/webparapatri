"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useT } from "./i18n";

/**
 * Temporizador Pomodoro (25 min de estudio y 5 de descanso; cada 4, un descanso largo).
 * Vive en la AppShell para que siga contando al cambiar de página, y se guarda en el navegador
 * para que tampoco se pierda al recargar. Cada bloque de estudio terminado se guarda en /sessions.
 */

export type Phase = "idle" | "focus" | "break";

interface State {
  phase: Phase;
  /** Hora (ms) a la que termina la fase en marcha; null si está en pausa o parado. */
  endsAt: number | null;
  /** Segundos que quedaban al pausar. */
  pausedLeft: number | null;
  focusMin: number;
  breakMin: number;
  subjectId: string | null;
  /** Bloques de estudio terminados seguidos (para el descanso largo). */
  done: number;
}

const KEY = "pomodoro";
const INITIAL: State = {
  phase: "idle",
  endsAt: null,
  pausedLeft: null,
  focusMin: 25,
  breakMin: 5,
  subjectId: null,
  done: 0,
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...INITIAL, ...JSON.parse(raw) } : INITIAL;
  } catch {
    return INITIAL;
  }
}

/** Tres pitidos suaves. */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.32);
    });
  } catch {
    /* sin sonido */
  }
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(title, { body, icon: "/icon-rosa-512.png" });
  } catch {
    /* sin notificaciones */
  }
}

interface Ctx {
  state: State;
  /** Segundos que quedan de la fase actual. */
  left: number;
  running: boolean;
  start: (opts: { focusMin: number; subjectId: string | null }) => void;
  pause: () => void;
  resume: () => void;
  /** Para el bloque de estudio: si lleva 5 minutos o más, se guarda lo estudiado. */
  stop: () => void;
  skipBreak: () => void;
  /** Se incrementa cada vez que se guarda una sesión (para refrescar los resúmenes). */
  saved: number;
}

const PomodoroContext = createContext<Ctx | null>(null);

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState(0);
  const tp = useT().pomodoro;

  // Se lee lo guardado al montar (en el servidor no hay localStorage).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(load());
  }, []);

  const update = useCallback((next: State) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* se ignora */
    }
  }, []);

  const save = useCallback((minutes: number, subjectId: string | null) => {
    if (minutes < 1) return;
    api
      .post("/sessions", { subject_id: subjectId, minutes: Math.min(240, minutes) })
      .then(() => setSaved((n) => n + 1))
      .catch(() => undefined);
  }, []);

  // Cada segundo se actualiza el reloj y, al llegar a cero, se pasa a la fase siguiente
  // (también si ha terminado con la web cerrada: se hace en el primer segundo al volver).
  useEffect(() => {
    if (!state.endsAt) return;
    const endsAt = state.endsAt;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t < endsAt) return;
      clearInterval(id);
      beep();
      if (state.phase === "focus") {
        save(state.focusMin, state.subjectId);
        const done = state.done + 1;
        const breakMin = done % 4 === 0 ? 15 : 5;
        notify(tp.focusDone(breakMin), tp.focusDoneBody);
        update({ ...state, phase: "break", done, breakMin, endsAt: t + breakMin * 60_000, pausedLeft: null });
      } else {
        notify(tp.breakDone, tp.breakDoneBody);
        update({ ...state, phase: "idle", endsAt: null, pausedLeft: null });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state, save, update, tp]);

  const total = (state.phase === "focus" ? state.focusMin : state.breakMin) * 60;
  const left =
    state.phase === "idle"
      ? state.focusMin * 60
      : state.endsAt
        ? Math.max(0, Math.ceil((state.endsAt - now) / 1000))
        : (state.pausedLeft ?? total);

  const value: Ctx = {
    state,
    left,
    running: !!state.endsAt,
    saved,
    start: ({ focusMin, subjectId }) => {
      try {
        if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      } catch {
        /* sin notificaciones */
      }
      setNow(Date.now());
      update({
        ...state,
        phase: "focus",
        focusMin,
        subjectId,
        endsAt: Date.now() + focusMin * 60_000,
        pausedLeft: null,
      });
    },
    pause: () => update({ ...state, endsAt: null, pausedLeft: left }),
    resume: () => {
      setNow(Date.now());
      update({ ...state, endsAt: Date.now() + left * 1000, pausedLeft: null });
    },
    stop: () => {
      if (state.phase === "focus") {
        const studied = Math.round((state.focusMin * 60 - left) / 60);
        if (studied >= 5) save(studied, state.subjectId);
      }
      update({ ...state, phase: "idle", endsAt: null, pausedLeft: null, done: 0 });
    },
    skipBreak: () => update({ ...state, phase: "idle", endsAt: null, pausedLeft: null }),
  };

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoro fuera de PomodoroProvider");
  return ctx;
}

export const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** "1 h 25 min", "40 min" */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

export interface SessionSummary {
  today_minutes: number;
  week_minutes: number;
  week: { date: string; minutes: number }[];
  by_subject: { subject_id: string | null; name: string | null; minutes: number }[];
}

export const sessionSummaryUrl = () => `/sessions/summary?tz=${new Date().getTimezoneOffset()}`;
