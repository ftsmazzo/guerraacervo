import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles } from "@/db/schema";
import { notifySeboHandoff } from "@/lib/tenant-alerts";
import type { EvolutionConfig } from "@/lib/whatsapp/evolution";
import { sendTextMessage } from "@/lib/whatsapp/evolution";

export type HandoffReason = "atendente" | "off_topic" | "sell";

export async function pauseBotAndNotifyHandoff(opts: {
  cfg: EvolutionConfig;
  tenantId: string;
  instanceName: string;
  phone: string;
  clientName: string;
  preview: string;
  reason: HandoffReason;
  profileId?: string;
  clientId?: string;
}) {
  if (opts.profileId) {
    await db
      .update(clientProfiles)
      .set({ onboardingStep: "human", updatedAt: new Date() })
      .where(eq(clientProfiles.id, opts.profileId));
  }

  const first = opts.clientName.split(" ")[0] || "";
  const reply =
    opts.reason === "sell"
      ? `Combinado${first ? `, ${first}` : ""}. Vou chamar alguém do sebo pra falar de venda ou troca do seu livro. Pode mandar os detalhes por aqui.`
      : opts.reason === "off_topic"
        ? `Essa parte alguém do sebo responde melhor${first ? `, ${first}` : ""}. Já avisei — pode continuar por aqui.`
        : `Claro${first ? `, ${first}` : ""}! Vou chamar alguém do sebo. Digite *voltar bot* se quiser o assistente de volta.`;

  await sendTextMessage(opts.cfg, opts.instanceName, opts.phone, reply);

  await notifySeboHandoff({
    tenantId: opts.tenantId,
    clientName: opts.clientName || opts.phone,
    clientId: opts.clientId,
    preview: opts.preview,
    phone: opts.phone,
  });
}
