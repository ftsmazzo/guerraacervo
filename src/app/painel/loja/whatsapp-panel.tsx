"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  refreshWhatsappStatus,
} from "@/lib/whatsapp/actions";

export function WhatsappPanel({
  initial,
  configured,
}: {
  configured: boolean;
  initial: {
    status: string;
    phone: string | null;
    qr: string | null;
    instanceName: string | null;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [status, setStatus] = useState(initial.status);
  const [qr, setQr] = useState<string | null>(initial.qr);
  const [phone, setPhone] = useState<string | null>(initial.phone);

  function applyResult(
    result:
      | {
          ok: true;
          status: string;
          qr?: string | null;
          phone?: string | null;
          message?: string;
        }
      | { ok: false; error: string },
  ) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setOk(result.message || null);
    setStatus(result.status);
    if (result.qr !== undefined) setQr(result.qr);
    if (result.phone !== undefined) setPhone(result.phone ?? null);
    router.refresh();
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-card p-6 text-sm text-muted">
        Evolution API ainda não está configurada neste ambiente. Peça ao
        administrador para definir <code>EVOLUTION_BASE_URL</code> e{" "}
        <code>EVOLUTION_API_KEY</code>.
      </div>
    );
  }

  const statusLabel =
    status === "open"
      ? "Conectado"
      : status === "qr"
        ? "Aguardando QR"
        : "Desconectado";

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {ok}
        </div>
      ) : null}

      <div className="rounded-lg border border-line bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Status WhatsApp</p>
            <p className="mt-1 text-lg font-semibold text-ink">{statusLabel}</p>
            {phone ? (
              <p className="mt-1 text-sm text-muted">Número: {phone}</p>
            ) : null}
            {initial.instanceName ? (
              <p className="mt-1 text-xs text-muted">
                Instância: {initial.instanceName}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => {
                setOk(null);
                start(async () => applyResult(await connectWhatsapp()));
              }}
            >
              {status === "open" ? "Reconectar" : "Conectar / Gerar QR"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm disabled:opacity-60"
              onClick={() => {
                setOk(null);
                start(async () => applyResult(await refreshWhatsappStatus()));
              }}
            >
              Atualizar status
            </button>
            {status !== "disconnected" ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                onClick={() => {
                  if (!confirm("Desconectar o WhatsApp deste sebo?")) return;
                  setOk(null);
                  start(async () => applyResult(await disconnectWhatsapp()));
                }}
              >
                Desconectar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {qr && status !== "open" ? (
        <div className="rounded-lg border border-line bg-card p-4 text-center shadow-[var(--shadow)]">
          <p className="mb-3 text-sm text-muted">
            Abra o WhatsApp do sebo → Aparelhos conectados → Conectar um
            aparelho e escaneie:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              qr.startsWith("data:")
                ? qr
                : `data:image/png;base64,${qr.replace(/^data:image\/\w+;base64,/, "")}`
            }
            alt="QR Code WhatsApp"
            className="mx-auto max-w-[280px] rounded-md border border-line bg-white p-2"
          />
        </div>
      ) : null}

      {!qr && status === "qr" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Aguardando o QR da Evolution. Clique em <strong>Atualizar status</strong>{" "}
          em alguns segundos. Se não aparecer, use <strong>Desconectar</strong> e
          depois <strong>Conectar / Gerar QR</strong> de novo.
        </div>
      ) : null}

      <div className="rounded-lg border border-line bg-card p-4 text-sm text-muted shadow-[var(--shadow)]">
        <p className="font-medium text-ink">Agente de vendas</p>
        <p className="mt-1">
          Status:{" "}
          <span className="font-semibold text-ink">
            {status === "open" ? "Agente ativo" : "Aguardando conexão"}
          </span>
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Onboarding de perfil (gêneros, temas, preço, opt-in)</li>
          <li>
            Indicações e busca no acervo (OpenRouter + tags do cliente)
          </li>
          <li>
            Reserva de pedido em <strong>Aguardando Pagamento</strong>
          </li>
          <li>
            Handoff humano (*atendente* / *sair*) — no perfil do cliente use{" "}
            <strong>Retomar bot</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
