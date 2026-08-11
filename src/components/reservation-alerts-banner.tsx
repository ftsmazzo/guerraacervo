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
          className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 text-sm text-accent-text"
        >
          <p>
            <span className="font-semibold">Nova reserva</span>
            {" — "}
            tire <span className="font-medium">{a.bookTitle}</span> da
            prateleira
            {a.clientName ? ` · ${a.clientName}` : null}
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={`/painel/pedidos/${a.orderId}`}
              className="font-medium underline"
            >
              Abrir pedido
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => dismiss(a.id)}
              className="text-xs text-muted hover:text-ink disabled:opacity-50"
            >
              Dispensar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
