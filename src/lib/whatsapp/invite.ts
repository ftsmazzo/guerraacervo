import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles, clients, tenants } from "@/db/schema";
import {
  normalizePhone,
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";
import {
  getOrCreateClientProfile,
  getWhatsappConnection,
} from "@/lib/whatsapp/queries";

/**
 * Após pedido Pago: agradece e inicia o onboarding de perfil (1ª pergunta).
 * Idempotente — não reenvia se já in_progress / done / skipped.
 */
export async function inviteProfileAfterPaid(opts: {
  tenantId: string;
  clientId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const cfg = resolveEvolutionConfig();
  if (!cfg) return { sent: false, reason: "no_evolution" };

  const conn = await getWhatsappConnection(opts.tenantId);
  if (!conn || conn.status !== "open") {
    return { sent: false, reason: "wa_offline" };
  }

  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      whatsapp: clients.whatsapp,
    })
    .from(clients)
    .where(
      and(eq(clients.id, opts.clientId), eq(clients.tenantId, opts.tenantId)),
    )
    .limit(1);
  if (!client?.whatsapp) return { sent: false, reason: "no_whatsapp" };

  const phone = normalizePhone(client.whatsapp);
  if (!phone) return { sent: false, reason: "bad_phone" };

  const profile = await getOrCreateClientProfile(opts.tenantId, client.id);
  if (
    profile.onboardingStatus === "done" ||
    profile.onboardingStatus === "skipped" ||
    profile.onboardingStatus === "in_progress"
  ) {
    return { sent: false, reason: "already_started" };
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId))
    .limit(1);
  const sebo = tenant?.name || "nosso sebo";
  const first = client.name.split(" ")[0] || "";

  const text =
    `Oi${first ? `, ${first}` : ""}! Obrigado pela compra no *${sebo}* 📚\n` +
    `Se quiser, monto seu perfil em 4 perguntas rápidas pra te avisar de livros no seu gosto.\n\n` +
    `1) Quais *gêneros* você mais gosta? (ex.: romance, suspense, história)\n` +
    `(Se preferir depois, é só ignorar esta mensagem.)`;

  await db
    .update(clientProfiles)
    .set({
      onboardingStatus: "in_progress",
      onboardingStep: "genres",
      updatedAt: new Date(),
    })
    .where(eq(clientProfiles.id, profile.id));

  await sendTextMessage(cfg, conn.instanceName, phone, text);
  return { sent: true };
}

export async function softColdReply(opts: {
  tenantId: string;
  instanceName: string;
  phone: string;
  pushName?: string;
}) {
  const cfg = resolveEvolutionConfig();
  if (!cfg) return;

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId))
    .limit(1);
  const sebo = tenant?.name || "nosso sebo";
  const hi = opts.pushName ? `, ${opts.pushName}` : "";

  await sendTextMessage(
    cfg,
    opts.instanceName,
    opts.phone,
    `Olá${hi}! Aqui é o *${sebo}*.\n` +
      `O cadastro e o atendimento personalizado começam depois da compra no balcão — aí te chamamos por aqui.\n` +
      `Se já comprou conosco e não recebeu mensagem, fale com a gente no sebo 😊`,
  );
}
