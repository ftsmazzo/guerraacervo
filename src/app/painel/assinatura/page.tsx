import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import {
  billingProviderFromSettings,
  efiPaidAtFromSettings,
} from "@/lib/billing/provider";
import { getPlan } from "@/lib/plans";
import { AssinaturaClient } from "./assinatura-client";

function money(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AssinaturaPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/assinatura");

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);
  if (!tenant) redirect("/painel");

  const settings = (tenant.settings || {}) as Record<string, unknown>;
  const billing = billingProviderFromSettings(settings);
  const resolved =
    billing !== "unknown"
      ? billing
      : tenant.stripeCustomerId
        ? "stripe"
        : "unknown";
  const plan = getPlan(tenant.planCode);
  const paidAt = efiPaidAtFromSettings(settings);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink">Assinatura</h1>
      <p className="mt-1 text-sm text-muted">
        Plano, cobrança e cancelamento desta conta.
      </p>

      <dl className="mt-6 grid gap-3 rounded-lg border border-line bg-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Plano</dt>
          <dd className="font-medium text-ink">{plan?.name ?? tenant.planCode}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Valor</dt>
          <dd className="text-ink">{money(plan?.priceMonthlyBrl)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Status</dt>
          <dd className="text-ink">{tenant.status}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Pagamento</dt>
          <dd className="text-ink">
            {resolved === "efi"
              ? "Pix (Efí)"
              : resolved === "stripe"
                ? "Cartão (Stripe)"
                : "Não definido"}
          </dd>
        </div>
        {paidAt ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Último Pix</dt>
            <dd className="text-ink">
              {new Date(paidAt).toLocaleString("pt-BR")}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6">
        <AssinaturaClient
          billing={resolved}
          hasStripe={Boolean(tenant.stripeCustomerId)}
        />
      </div>
    </div>
  );
}
