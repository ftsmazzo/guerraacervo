import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { businessPlans, personalPlans } from "@/lib/plans";

export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login?next=/admin");
  if (!ctx.user.isPlatformAdmin) redirect("/painel");

  const all = [...businessPlans(), ...personalPlans()];

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-ink">Control plane</p>
            <p className="text-xs text-muted">
              {ctx.user.name} · {ctx.user.email}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/painel" className="text-muted hover:text-ink">
              ← Painel
            </Link>
            <Link href="/api/auth/logout" className="text-muted hover:text-ink">
              Sair
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-ink">Admin plataforma</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Catálogo de planos versionado em código. Listagem de tenants e billing
          Stripe entram nas próximas etapas.
        </p>

        <div className="mt-8 overflow-hidden rounded-lg border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-background text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Máx. livros</th>
                <th className="px-4 py-3 font-medium">Preço</th>
              </tr>
            </thead>
            <tbody>
              {all.map((plan) => (
                <tr
                  key={plan.code}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs">{plan.code}</td>
                  <td className="px-4 py-3">{plan.product}</td>
                  <td className="px-4 py-3">{plan.name}</td>
                  <td className="px-4 py-3">
                    {plan.maxBooks === null ? "∞" : plan.maxBooks}
                  </td>
                  <td className="px-4 py-3">
                    {plan.priceMonthlyBrl === null
                      ? "—"
                      : plan.priceMonthlyBrl === 0
                        ? "Grátis"
                        : `R$ ${plan.priceMonthlyBrl.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
