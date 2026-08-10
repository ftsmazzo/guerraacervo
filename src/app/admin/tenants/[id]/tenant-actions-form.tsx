"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  blockTenant,
  extendTrial,
  unblockTenant,
  updateTenantPlan,
  updateTenantStatus,
} from "@/app/admin/actions";

type Props = {
  tenantId: string;
  currentPlan: string;
  currentStatus: string;
  planOptions: { code: string; name: string }[];
};

export function TenantActionsForm({
  tenantId,
  currentPlan,
  currentStatus,
  planOptions,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [plan, setPlan] = useState(currentPlan);
  const [status, setStatus] = useState(currentStatus);
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<void>) {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg(label);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <h2 className="font-semibold text-ink">Assinatura</h2>
      <p className="mt-1 text-sm text-muted">
        Bloquear impede gravações no painel do sebo. Liberar reativa a conta.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="text-muted">Plano</span>
          <div className="mt-1 flex gap-2">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="flex-1 rounded-md border border-line bg-background px-3 py-2"
            >
              {planOptions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("Plano atualizado.", () => updateTenantPlan(tenantId, plan))
              }
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
            >
              Aplicar
            </button>
          </div>
        </label>

        <label className="block text-sm">
          <span className="text-muted">Status</span>
          <div className="mt-1 flex gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex-1 rounded-md border border-line bg-background px-3 py-2"
            >
              <option value="trialing">trialing</option>
              <option value="active">active</option>
              <option value="past_due">past_due</option>
              <option value="suspended">suspended</option>
              <option value="canceled">canceled</option>
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("Status atualizado.", () =>
                  updateTenantStatus(tenantId, status as never),
                )
              }
              className="rounded-md border border-line px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              Aplicar
            </button>
          </div>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run("Conta bloqueada.", () => blockTenant(tenantId))}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-60"
          >
            Bloquear
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run("Conta liberada.", () => unblockTenant(tenantId))
            }
            className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 disabled:opacity-60"
          >
            Liberar
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-muted">Estender trial (dias)</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-24 rounded-md border border-line bg-background px-3 py-2"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("Trial estendido.", () => extendTrial(tenantId, days))
              }
              className="rounded-md border border-line px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              Estender
            </button>
          </div>
        </label>

        {msg ? (
          <p className="rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-accent-text">
            {msg}
          </p>
        ) : null}
      </div>
    </div>
  );
}
