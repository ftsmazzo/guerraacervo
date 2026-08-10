import { getAuthContext } from "@/lib/auth/context";
import { EntitlementGate } from "@/components/entitlement-gate";

function Stub({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 max-w-xl text-sm text-muted">{blurb}</p>
      <div className="mt-6 rounded-lg border border-dashed border-line bg-card p-8 text-sm text-muted">
        Módulo stub — CRUD e regras do legado PHP serão portados para esta API.
      </div>
    </div>
  );
}

export default async function ClientesPage() {
  const ctx = await getAuthContext();
  return (
    <EntitlementGate
      planCode={ctx?.tenant?.planCode}
      entitlement="clients"
      title="Clientes"
    >
      <Stub
        title="Clientes"
        blurb="Cadastro com WhatsApp, endereço e histórico de pedidos."
      />
    </EntitlementGate>
  );
}
