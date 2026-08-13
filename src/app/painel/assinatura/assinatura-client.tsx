"use client";

import { useEffect, useState } from "react";

type PixCharge = {
  txid: string;
  copiaECola: string;
  qrImage: string | null;
  amount: string;
};

export function AssinaturaClient({
  billing,
  hasStripe,
}: {
  billing: "efi" | "stripe" | "unknown";
  hasStripe: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [paid, setPaid] = useState(false);

  async function openStripe() {
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
          <div className="rounded-lg border border-line bg-card p-4 text-center">
            <p className="text-sm text-muted">
              Valor:{" "}
              <strong>
                {Number(pix.amount).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </strong>
            </p>
            {pix.qrImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pix.qrImage}
                alt="QR Pix"
                className="mx-auto mt-3 h-48 w-48 rounded-md border border-line bg-white p-2"
              />
            ) : null}
            {pix.copiaECola ? (
              <p className="mt-3 break-all text-xs text-muted">{pix.copiaECola}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {paid ? "Confirmado." : "Aguardando pagamento…"}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {hasStripe
          ? "Assinatura no cartão (Stripe). Cartão, fatura e cancelamento ficam no portal."
          : "Nenhum provedor de pagamento ligado a esta conta."}
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {hasStripe ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void openStripe()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Abrindo…" : "Abrir portal Stripe"}
        </button>
      ) : null}
    </div>
  );
}
