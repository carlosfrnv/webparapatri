"use client";

import { BellRinging, BellSlash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { GradientIcon } from "./GradientIcon";

type Status = "loading" | "unsupported" | "needsInstall" | "off" | "on" | "denied" | "serverOff";

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Activar los recordatorios en este dispositivo: exámenes, entregas, flashcards pendientes y las notas de Carlos.
 * En el iPad/iPhone solo funcionan con la web añadida a la pantalla de inicio.
 */
export function PushCard({ compact = false, onHide }: { compact?: boolean; onHide?: () => void }) {
  const t = useT();
  const tp = t.push;
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus(isIos() && !isInstalled() ? "needsInstall" : "unsupported");
        return;
      }
      if (isIos() && !isInstalled()) return setStatus("needsInstall");
      if (Notification.permission === "denied") return setStatus("denied");
      setStatus((await currentSubscription()) ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const { key } = await api.get<{ key: string | null }>("/push/key");
      if (!key) return setStatus("serverOff");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }));
      await api.post("/push/subscribe", { subscription: subscription.toJSON() });
      await api.post("/push/test");
      setStatus("on");
      setMessage(tp.testSent);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported") return null;
  // En el inicio solo se ofrece mientras no estén activados.
  if (compact && (status === "on" || status === "denied" || status === "serverOff")) return null;

  const text =
    status === "on"
      ? tp.on
      : status === "needsInstall"
        ? tp.needsInstall
        : status === "denied"
          ? tp.denied
          : status === "serverOff"
            ? tp.serverOff
            : tp.intro;

  return (
    <section className="card mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <GradientIcon icon={status === "on" ? BellRinging : BellSlash} tone="amber" size={52} />
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">{tp.title}</h2>
        <p className="text-muted mt-0.5 text-sm whitespace-pre-line">{text}</p>
        {message && <p className="text-accent mt-1 text-sm font-medium">{message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "off" && (
          <button className="btn-primary" disabled={busy} onClick={enable}>
            {tp.enable}
          </button>
        )}
        {status === "on" && (
          <button className="btn-ghost" disabled={busy} onClick={disable}>
            {tp.disable}
          </button>
        )}
        {compact && onHide && (
          <button className="btn-ghost" onClick={onHide}>
            {tp.later}
          </button>
        )}
      </div>
    </section>
  );
}
