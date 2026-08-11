import { redirect } from "next/navigation";
import { PushAlertsCard } from "@/components/push-enable-button";
import { MobileAppInstallGuide } from "@/components/mobile-app-install-guide";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getReservationNotifyWhatsapp } from "@/lib/loja/settings";
import { resolveEvolutionConfig } from "@/lib/whatsapp/evolution";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";
import { ReservationNotifyForm } from "./reservation-notify-form";
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
  const notifyPhone = await getReservationNotifyWhatsapp();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Loja e alertas</h1>
      <p className="mt-1 text-sm text-muted">
        Instale o app no celular da prateleira, ative notificações e conecte o
        WhatsApp do sebo.
      </p>

      <div className="mt-6 space-y-8">
        <section aria-labelledby="app-title">
          <h2
            id="app-title"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
          >
            1 · App no celular
          </h2>
          <div className="space-y-4">
            <MobileAppInstallGuide />
            <PushAlertsCard />
          </div>
        </section>

        <section aria-labelledby="wa-alert-title">
          <h2
            id="wa-alert-title"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
          >
            2 · WhatsApp de alerta (prateleira)
          </h2>
          <ReservationNotifyForm initialPhone={notifyPhone} />
        </section>

        <section aria-labelledby="wa-store-title">
          <h2
            id="wa-store-title"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
          >
            3 · WhatsApp do sebo (clientes)
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
        </section>
      </div>
    </div>
  );
}
