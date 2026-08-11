"use client";

import { useEffect, useState, useTransition } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushEnableButton() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setEnabled(Boolean(sub));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setMessage("Permissão de notificação negada.");
          return;
        }
        const keyRes = await fetch("/api/push/vapid-public");
        const keyData = await keyRes.json().catch(() => ({}));
        if (!keyRes.ok || !keyData.publicKey) {
          setMessage(keyData.error || "Push não configurado no servidor.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
          });
        }
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error || "Falha ao ativar.");
          return;
        }
        setEnabled(true);
        setMessage("Notificações no celular ativas.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao ativar push.");
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await fetch("/api/push/subscribe", { method: "DELETE" });
        setEnabled(false);
        setMessage("Notificações desativadas.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao desativar.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={enabled ? disable : enable}
        className="text-sm text-accent-text hover:underline disabled:opacity-60"
      >
        {pending
          ? "…"
          : enabled
            ? "Desativar alertas no celular"
            : "Ativar alertas no celular"}
      </button>
      {message ? (
        <span className="max-w-[14rem] text-right text-[0.65rem] text-muted">
          {message}
        </span>
      ) : null}
    </div>
  );
}
