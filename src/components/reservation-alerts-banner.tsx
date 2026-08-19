"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TenantAlert } from "@/lib/tenant-alerts";

export function ReservationAlertsBanner({
  alerts,
}: {
  alerts: TenantAlert[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !hidden.has(a.id));
  if (!visible.length) return null;

  async function dismiss(id: string) {
    setHidden((prev) => new Set(prev).add(id));
    start(async () => {
      await fetch("/api/painel/alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: id }),
      });
      router.refresh();
    });
  }

  return (
    <div className="border-b border-line bg-accent-soft">
      {visible.map((a) => (
        <div
          key={a.id}
          className="flex flex-col gap-2 border-b border-line/60 px-4 py-3 text-sm text-accent-text last:border-b-0 md:flex-row md:flex-wrap md:items-center md:justify-between md:px-6 md:py-2.5"
        >
          <p className="leading-snug">
            {a.type === "handoff" ? (
              <>
                <span className="font-semibold">Cliente no WhatsApp</span>
                {" — "}
                {a.clientName}
                {a.preview || a.bookTitle
                  ? ` · ${a.preview || a.bookTitle}`
                  : null}
              </>
            ) : (
              <>
                <span className="font-semibold">Nova reserva</span>
                {" — "}
                tire <span className="font-medium">{a.bookTitle}</span> da
                prateleira
                {a.clientName ? ` · ${a.clientName}` : null}
              </>
            )}
          </p>
          <div className="flex items-center gap-3">
            {a.type === "handoff" ? (
              <Link
                href={
                  a.clientId
                    ? `/painel/clientes/${a.clientId}`
                    : "/painel/clientes"
                }
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white md:min-h-0 md:flex-none md:bg-transparent md:px-0 md:py-0 md:text-accent-text md:underline"
              >
                Abrir cliente
              </Link>
            ) : (
              <Link
                href={`/painel/pedidos/${a.orderId}`}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white md:min-h-0 md:flex-none md:bg-transparent md:px-0 md:py-0 md:text-accent-text md:underline"
              >
                Abrir pedido
              </Link>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => dismiss(a.id)}
              className="min-h-10 px-2 text-xs text-muted hover:text-ink disabled:opacity-50"
            >
              Dispensar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
