import { getAuthContext } from "@/lib/auth/context";
import { EntitlementGate } from "@/components/entitlement-gate";

export default async function RelatoriosPage() {
  const ctx = await getAuthContext();
  return (
    <EntitlementGate
      planCode={ctx?.tenant?.planCode}
      entitlement="reports_basic"
      title="Relatórios"
    >
      <div>
        <h1 className="text-2xl font-semibold text-ink">Relatórios</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Vendas, estoque e indicadores do plano.
        </p>
        <div className="mt-6 rounded-lg border border-dashed border-line bg-card p-8 text-sm text-muted">
          Módulo stub — relatórios avançados exigem entitlement{" "}
          <code className="rounded bg-accent-soft px-1.5 py-0.5 text-accent-text">
            reports_advanced
          </code>
          .
        </div>
      </div>
    </EntitlementGate>
  );
}
