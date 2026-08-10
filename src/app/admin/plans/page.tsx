import { businessPlans, personalPlans } from "@/lib/plans";
import { requirePlatformAdmin } from "@/lib/auth/guards";

export default async function AdminPlansPage() {
  await requirePlatformAdmin();
  const all = [...businessPlans(), ...personalPlans()];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Catálogo de planos</h1>
      <p className="mt-1 text-sm text-muted">
        Referência dos planos versionados em código. A gestão de cada conta fica
        em Contas.
      </p>
      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-card">
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
  );
}
