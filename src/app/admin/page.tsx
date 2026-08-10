import Link from "next/link";
import { businessPlans, personalPlans } from "@/lib/plans";

export default function AdminPage() {
  const all = [...businessPlans(), ...personalPlans()];

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-ink">Control plane</p>
            <p className="text-xs text-muted">Contas, planos e tenants</p>
          </div>
          <Link href="/painel" className="text-sm text-muted hover:text-ink">
            ← Painel
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-ink">Admin plataforma</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Aqui entram listagem de tenants, trial, billing Stripe e feature
          flags. Shell inicial com catálogo de planos versionado em código.
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
                <tr key={plan.code} className="border-b border-line last:border-0">
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
