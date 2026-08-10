import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { resolveEvolutionConfig } from "@/lib/whatsapp/evolution";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";
import { WhatsappPanel } from "./whatsapp-panel";

export default async function LojaPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/loja");
  if (!hasEntitlement(ctx.tenant.planCode, "store_whatsapp")) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink">Loja</h1>
        <p className="mt-3 text-sm text-muted">
          Seu plano não inclui WhatsApp / loja.
        </p>
      </div>
    );
  }

  const configured = Boolean(resolveEvolutionConfig());
  const conn = await getWhatsappConnection(ctx.tenant.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Loja</h1>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Canal WhatsApp do sebo — conexão, perfil de clientes e avisos de
        novidades. A vitrine pública entra no próximo ciclo.
      </p>
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          WhatsApp
        </h2>
        <WhatsappPanel
          configured={configured}
          initial={{
            status: conn?.status ?? "disconnected",
            phone: conn?.phone ?? null,
            qr: conn?.lastQr ?? null,
            instanceName: conn?.instanceName ?? null,
          }}
        />
      </div>
    </div>
  );
}
