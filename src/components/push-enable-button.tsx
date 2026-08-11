"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectEnv() {
  if (typeof window === "undefined") {
    return {
      isIos: false,
      isStandalone: false,
      hasPush: false,
      hasNotification: false,
      hasSW: false,
    };
  }
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari legacy
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    isIos,
    isStandalone,
    hasPush: "PushManager" in window,
    hasNotification: "Notification" in window,
    hasSW: "serviceWorker" in navigator,
  };
}

type Variant = "card" | "compact";

export function PushAlertsCard({ variant = "card" }: { variant?: Variant }) {
  const [env, setEnv] = useState(detectEnv);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = detectEnv();
    setEnv(next);
    setReady(true);
    if (!next.hasSW || !next.hasPush) return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
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

  const canActivate = useMemo(() => {
    if (!env.hasSW || !env.hasPush || !env.hasNotification) return false;
    // iOS: push só no PWA instalado
    if (env.isIos && !env.isStandalone) return false;
    return true;
  }, [env]);

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        if (!canActivate) {
          setMessage(
            env.isIos
              ? "No iPhone, abra pelo ícone na tela inicial (não pelo Safari)."
              : "Este navegador não permite notificações push.",
          );
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setMessage("Permissão de notificação negada nas configurações.");
          return;
        }
        const keyRes = await fetch("/api/push/vapid-public");
        const keyData = await keyRes.json().catch(() => ({}));
        if (!keyRes.ok || !keyData.publicKey) {
          setMessage(keyData.error || "Push não configurado no servidor.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
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
        setMessage("Pronto — reservas vão notificar neste aparelho.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao ativar push.");
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await fetch("/api/push/subscribe", { method: "DELETE" });
        setEnabled(false);
        setMessage("Notificações desativadas neste aparelho.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao desativar.");
      }
    });
  }

  if (!ready) {
    return (
      <div className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
        Carregando alertas do celular…
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="rounded-md border border-line bg-card px-3 py-2">
        <p className="text-xs font-medium text-ink">Alertas no celular</p>
        {!canActivate && env.isIos ? (
          <p className="mt-1 text-[0.7rem] leading-snug text-muted">
            iPhone: Compartilhar → Adicionar à Tela de Início → abrir o ícone →
            voltar em Loja e ativar.
          </p>
        ) : (
          <button
            type="button"
            disabled={pending || (!canActivate && !enabled)}
            onClick={enabled ? disable : enable}
            className="mt-1 text-xs font-medium text-accent-text underline disabled:opacity-50"
          >
            {pending
              ? "…"
              : enabled
                ? "Desativar"
                : canActivate
                  ? "Ativar"
                  : "Indisponível"}
          </button>
        )}
        {message ? (
          <p className="mt-1 text-[0.65rem] text-muted">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5 shadow-[var(--shadow)]">
      <h3 className="text-sm font-semibold text-ink">Notificações no celular</h3>
      <p className="mt-1 text-sm text-muted">
        Receba aviso na hora da reserva para tirar o livro da prateleira — mesmo
        com o painel fechado.
      </p>

      {env.isIos && !env.isStandalone ? (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink">
          <li>No Safari, toque em Compartilhar.</li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Abra o GuerraAcervo pelo ícone novo (não pelo Safari).</li>
          <li>Volte em Loja e toque em Ativar abaixo.</li>
        </ol>
      ) : null}

      {!env.hasPush && !env.isIos ? (
        <p className="mt-3 text-sm text-accent-text">
          Este navegador não suporta Web Push. Tente Chrome ou Edge no Android.
        </p>
      ) : null}

      {env.isIos && env.isStandalone && !env.hasPush ? (
        <p className="mt-3 text-sm text-accent-text">
          Atualize o iOS (16.4+) para receber notificações do app na tela
          inicial.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || (!canActivate && !enabled)}
          onClick={enabled ? disable : enable}
          className="min-h-11 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {pending
            ? "Aguarde…"
            : enabled
              ? "Desativar neste aparelho"
              : "Ativar alertas neste aparelho"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted">
        Status:{" "}
        {enabled
          ? "ativo neste aparelho"
          : canActivate
            ? "ainda não ativado"
            : env.isIos
              ? "precisa do ícone na tela inicial"
              : "navegador sem suporte"}
      </p>
      {message ? (
        <p className="mt-2 text-sm text-accent-text">{message}</p>
      ) : null}
    </div>
  );
}

/** @deprecated use PushAlertsCard */
export function PushEnableButton() {
  return <PushAlertsCard variant="compact" />;
}
