"use client";

import { useState } from "react";

type PixCheckoutPanelProps = {
  amount: string;
  copiaECola: string;
  qrImage: string | null;
  paid?: boolean;
  waitingLabel?: string;
  paidLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  error?: string | null;
  variant?: "funnel" | "painel";
};

export function PixCheckoutPanel({
  amount,
  copiaECola,
  qrImage,
  paid = false,
  waitingLabel = "Aguardando pagamento…",
  paidLabel = "Pix confirmado. Abrindo sua conta…",
  onBack,
  backLabel = "Escolher outra forma",
  error,
  variant = "funnel",
}: PixCheckoutPanelProps) {
  const [copied, setCopied] = useState(false);
  const value = Number(amount);
  const valueLabel = Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : amount;

  async function copyCode() {
    if (!copiaECola) return;
    try {
      await navigator.clipboard.writeText(copiaECola);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* ignore */
    }
  }

  return (
    <section
      className={
        variant === "funnel" ? "pix-panel pix-panel--funnel" : "pix-panel pix-panel--painel"
      }
      aria-live="polite"
    >
      <div className="pix-panel__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/prismabook-icon.png"
          alt=""
          width={40}
          height={40}
          className="pix-panel__mark"
        />
        <div>
          <p className="pix-panel__brand-name">PrismaBook</p>
          <p className="pix-panel__brand-sub">Pagamento via Pix</p>
        </div>
      </div>

      <h2 className="pix-panel__title">Pague {valueLabel}</h2>
      <p className="pix-panel__lead">
        Escaneie o QR no app do banco ou copie o código Pix.
      </p>

      {qrImage ? (
        <div className="pix-panel__qr-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImage} alt="QR Code Pix" className="pix-panel__qr" />
        </div>
      ) : null}

      {copiaECola ? (
        <button
          type="button"
          className="pix-panel__copy"
          onClick={() => void copyCode()}
        >
          <span className="pix-panel__copy-label">
            {copied ? "Código copiado" : "Copiar código Pix"}
          </span>
          <span className="pix-panel__copy-code">{copiaECola}</span>
        </button>
      ) : null}

      <div className={`pix-panel__status${paid ? " is-paid" : ""}`}>
        {!paid ? <span className="pix-panel__pulse" aria-hidden /> : null}
        <span>{paid ? paidLabel : waitingLabel}</span>
      </div>

      {error ? <p className="pix-panel__error">{error}</p> : null}

      {onBack ? (
        <button type="button" className="pix-panel__back" onClick={onBack}>
          {backLabel}
        </button>
      ) : null}
    </section>
  );
}
