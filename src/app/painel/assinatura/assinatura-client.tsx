"use client";

import { useEffect, useState } from "react";
import { PixCheckoutPanel } from "@/components/pix-checkout-panel";
import "@/components/landing/landing.css";

type PixCharge = {
  txid: string;
  copiaECola: string;
  qrImage: string | null;
  amount: string;
};

export function AssinaturaClient({
  billing,
  hasStripe,
  isFree,
  canPay,
}: {
  billing: "efi" | "stripe" | "unknown";
  hasStripe: boolean;
  isFree: boolean;
  canPay: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [paid, setPaid] = useState(false);

  async function openStripePortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Não foi possível abrir o portal Stripe.");
        return;
      }
      if (String(data.url).startsWith("/")) {
        window.location.href = data.url;
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  async function startStripeCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Não foi possível abrir o Checkout.");
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Erro ao criar sessão Stripe.");
    } finally {
      setLoading(false);
    }
  }

  async function renewPix() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/efi/renew", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.txid) {
        setError(data.error || "Não foi possível gerar o Pix.");
        return;
      }
      setPix({
        txid: data.txid,
        copiaECola: data.copiaECola || "",
        qrImage: data.qrImage || null,
        amount: data.amount || "",
      });
      setPaid(false);
    } catch {
      setError("Erro ao gerar Pix.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelPix() {
    if (!confirm("Cancelar a assinatura Pix desta conta?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/efi/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Falha ao cancelar.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Erro ao cancelar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!pix?.txid || paid) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/efi/status?txid=${encodeURIComponent(pix.txid)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (data.paid) {
          setPaid(true);
          window.location.reload();
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pix?.txid, paid]);

  if (isFree) {
    return (
      <p className="text-sm text-muted">
        Plano gratuito. Não há cobrança. Você pode mudar de plano quando quiser
        no cadastro de uma nova conta paga.
      </p>
    );
  }

  if (billing === "efi") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Esta conta paga por <strong>Pix (Efí)</strong>. Não usa Stripe.
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void renewPix()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Gerando…" : "Gerar Pix do mês"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void cancelPix()}
            className="rounded-md border border-line px-4 py-2 text-sm"
          >
            Cancelar assinatura
          </button>
        </div>
        {pix ? (
          <PixCheckoutPanel
            variant="painel"
            amount={pix.amount}
            copiaECola={pix.copiaECola}
            qrImage={pix.qrImage}
            paid={paid}
            paidLabel="Pix confirmado."
            error={error}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {hasStripe
          ? "Assinatura no cartão (Stripe). Cartão, fatura e cancelamento ficam no portal."
          : "Nenhum pagamento ainda. Após o teste, escolha Pix ou cartão para continuar."}
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {canPay ? (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void renewPix()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Gerando…" : "Pagar com Pix"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void startStripeCheckout()}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium"
            >
              {loading ? "Abrindo…" : "Pagar com cartão"}
            </button>
          </>
        ) : null}
        {hasStripe ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void openStripePortal()}
            className="rounded-md border border-line px-4 py-2 text-sm"
          >
            {loading ? "Abrindo…" : "Abrir portal Stripe"}
          </button>
        ) : null}
      </div>
      {pix ? (
        <PixCheckoutPanel
          variant="painel"
          amount={pix.amount}
          copiaECola={pix.copiaECola}
          qrImage={pix.qrImage}
          paid={paid}
          paidLabel="Pix confirmado."
          error={error}
        />
      ) : null}
    </div>
  );
}
