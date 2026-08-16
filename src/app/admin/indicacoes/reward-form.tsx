"use client";

import { useState, useTransition } from "react";
import { saveReferralRewardConfig } from "@/app/admin/actions";
import {
  REFERRAL_SCENARIOS,
  type ReferralRewardConfig,
  type ReferralRewardScenario,
} from "@/lib/referrals/config";

function fieldNames(key: ReferralRewardScenario) {
  return {
    type: `${key}Type`,
    cap: `${key}Cap`,
  };
}

export function ReferralRewardForm({
  initial,
}: {
  initial: ReferralRewardConfig;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="mt-6 space-y-4 rounded-lg border border-line bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveReferralRewardConfig({
            userRefersBusinessType: String(
              fd.get("userRefersBusinessType"),
            ) as "months" | "brl",
            userRefersBusinessCap: Number(fd.get("userRefersBusinessCap")),
            businessRefersUserType: String(
              fd.get("businessRefersUserType"),
            ) as "months" | "brl",
            businessRefersUserCap: Number(fd.get("businessRefersUserCap")),
            businessRefersBusinessType: String(
              fd.get("businessRefersBusinessType"),
            ) as "months" | "brl",
            businessRefersBusinessCap: Number(
              fd.get("businessRefersBusinessCap"),
            ),
            userRefersUserType: String(fd.get("userRefersUserType")) as
              | "months"
              | "brl",
            userRefersUserCap: Number(fd.get("userRefersUserCap")),
          });
          setMsg(res.ok ? "Premiação salva." : res.error);
        });
      }}
    >
      <div>
        <h2 className="font-semibold text-ink">Premiação</h2>
        <p className="mt-1 text-sm text-muted">
          Vale no primeiro pagamento de quem foi indicado. Trial não gera
          crédito. Meses = piso (mensalidade do indicado ÷ mensalidade de quem
          indicou), limitado ao teto. Reais = valor igual à mensalidade de quem
          pagou.
        </p>
      </div>

      {REFERRAL_SCENARIOS.map(({ key, label, hint }) => {
        const names = fieldNames(key);
        const rule = initial[key];
        return (
          <fieldset
            key={key}
            className="grid gap-3 rounded-md border border-line bg-background p-3 sm:grid-cols-[1fr_140px_100px]"
          >
            <legend className="px-1 text-sm font-medium text-ink">{label}</legend>
            <p className="text-xs text-muted sm:col-span-3">{hint}</p>
            <label className="text-xs text-muted sm:col-start-1">
              Tipo
              <select
                name={names.type}
                defaultValue={rule.type}
                className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink"
              >
                <option value="months">Meses grátis</option>
                <option value="brl">Crédito em R$</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Teto de meses
              <input
                type="number"
                name={names.cap}
                min={1}
                max={60}
                defaultValue={rule.type === "months" ? rule.capMonths : 1}
                className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink"
              />
            </label>
          </fieldset>
        );
      })}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar premiação"}
      </button>
      {msg ? (
        <p className="text-sm text-accent-text">{msg}</p>
      ) : null}
    </form>
  );
}
