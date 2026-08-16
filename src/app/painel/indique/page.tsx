import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import {
  ensureTenantReferralCode,
  listReferralsForTenant,
  referralCreditTotals,
  referralSignupUrl,
} from "@/lib/referrals/queries";
import { IndiqueClient } from "./indique-client";

const STATUS_LABEL: Record<string, string> = {
  signed_up: "Cadastrou (ainda não pagou)",
  paid: "Pagou",
  rewarded: "Crédito aplicado",
  invalid: "Inválido",
};

export default async function IndiquePage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/indique");

  const code = await ensureTenantReferralCode(ctx.tenant.id);
  const items = await listReferralsForTenant(ctx.tenant.id);
  const totals = await referralCreditTotals(ctx.tenant.id);
  const seboUrl = code ? referralSignupUrl(code) : "";
  const userUrl = code ? referralSignupUrl(code, "personal") : "";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Indique e ganhe</h1>
      <p className="mt-1 text-sm text-muted">
        Compartilhe seu código. O crédito só entra no{" "}
        <strong>primeiro pagamento confirmado</strong> de quem você indicou —
        trial não gera prêmio. Os valores estão configuráveis até fecharmos a
        tabela com o Renato.
      </p>

      {code ? (
        <IndiqueClient code={code} seboUrl={seboUrl} userUrl={userUrl} />
      ) : (
        <p className="mt-6 text-sm text-red-600">Não foi possível gerar o código.</p>
      )}

      <dl className="mt-6 grid gap-3 rounded-lg border border-line bg-card p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Meses creditados</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">{totals.months}</dd>
        </div>
        <div>
          <dt className="text-muted">Desconto acumulado (R$)</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">
            {totals.brl.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-semibold text-ink">Indicações</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Ninguém usou seu código ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-card">
          {items.map((row) => (
            <li key={row.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-ink">{row.referredName}</p>
                <p className="text-xs text-muted">
                  {row.referredProduct === "business" ? "Sebo" : "Usuário"} ·{" "}
                  {row.referredPlan}
                </p>
              </div>
              <span className="text-xs text-muted">
                {STATUS_LABEL[row.status] || row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
