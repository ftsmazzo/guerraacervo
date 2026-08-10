import { getAuthContext } from "@/lib/auth/context";
import { EntitlementGate } from "@/components/entitlement-gate";

export default async function PedidosPage() {
  const ctx = await getAuthContext();
  return (
    <EntitlementGate
      planCode={ctx?.tenant?.planCode}
      entitlement="orders"
      title="Pedidos"
    >
      <div>
        <h1 className="text-2xl font-semibold text-ink">Pedidos</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Vendas, status de pagamento e rastreio.
        </p>
        <div className="mt-6 rounded-lg border border-dashed border-line bg-card p-8 text-sm text-muted">
          Módulo stub — CRUD e regras do legado PHP serão portados para esta API.
        </div>
      </div>
    </EntitlementGate>
  );
}
