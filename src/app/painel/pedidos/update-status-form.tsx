"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { updateOrderStatus } from "@/lib/orders/actions";
import { ORDER_STATUSES } from "@/lib/orders/constants";

export function UpdateStatusForm({
  orderId,
  currentStatus,
  currentTracking,
}: {
  orderId: string;
  currentStatus: string;
  currentTracking: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [status, setStatus] = useState(currentStatus);
  const [rastreio, setRastreio] = useState(currentTracking ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    start(async () => {
      const result = await updateOrderStatus(orderId, {
        status,
        codigoRastreio: rastreio || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOk(result.message || "Status atualizado.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="error-box">{error}</div> : null}
      {ok ? <div className="ok-box">{ok}</div> : null}
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="form-label">Status</label>
        <select
          className="form-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="form-label">Código de Rastreio</label>
        <input
          className="form-control"
          value={rastreio}
          onChange={(e) => setRastreio(e.target.value)}
          placeholder="Opcional"
        />
      </div>
      <button type="submit" className="btn-accent" disabled={pending}>
        {pending ? "Salvando…" : "Atualizar Status"}
      </button>
    </form>
  );
}
