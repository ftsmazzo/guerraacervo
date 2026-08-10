import { getAuthContext } from "@/lib/auth/context";
import { EntitlementGate } from "@/components/entitlement-gate";

export default async function LojaPage() {
  const ctx = await getAuthContext();
  return (
    <EntitlementGate
      planCode={ctx?.tenant?.planCode}
      entitlement={["store_whatsapp", "store_pix"]}
      title="Loja"
    >
      <div>
        <h1 className="text-2xl font-semibold text-ink">Loja</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Página pública do sebo com compra via WhatsApp (e Pix no Master).
        </p>
        <div className="mt-6 rounded-lg border border-dashed border-line bg-card p-8 text-sm text-muted">
          Módulo stub — loja pública entra após o CRUD operacional.
        </div>
      </div>
    </EntitlementGate>
  );
}
