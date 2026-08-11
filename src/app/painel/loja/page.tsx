import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getReservationNotifyWhatsapp } from "@/lib/loja/settings";
import { resolveEvolutionConfig } from "@/lib/whatsapp/evolution";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";
import { ReservationNotifyForm } from "./reservation-notify-form";
import { WhatsappPanel } from "./whatsapp-panel";
import { PushAlertsCard } from "@/components/push-enable-button";

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
  const notifyPhone = await getReservationNotifyWhatsapp();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Loja</h1>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Canal WhatsApp do sebo — conexão, alertas de reserva e avisos de
        novidades.
      </p>
      <div className="mt-6 space-y-8">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            WhatsApp do sebo
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
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Alertas
          </h2>
          <div className="space-y-4">
            <PushAlertsCard />
            <ReservationNotifyForm initialPhone={notifyPhone} />
          </div>
        </div>
      </div>
    </div>
  );
}
