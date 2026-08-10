import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles, clients } from "@/db/schema";
import { shouldProcessMessage } from "@/lib/whatsapp/agent/debounce";
import { runSalesAgent } from "@/lib/whatsapp/agent/sales";
import {
  normalizePhone,
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";
import { runOnboardingFlow } from "@/lib/whatsapp/onboarding";
import {
  findClientByWhatsapp,
  getConnectionByInstance,
  getOrCreateClientProfile,
} from "@/lib/whatsapp/queries";

function isHandoffKeyword(text: string) {
  return /\b(atendente|humano|pessoa real)\b/i.test(text);
}

function isPauseBot(text: string) {
  return /^(sair|pausar|parar bot|stop)\b/i.test(text.trim());
}

function isResumeBot(text: string) {
  return /voltar\s*bot|reativar\s*bot|assistente/i.test(text.trim());
}

export async function handleInboundMessage(opts: {
  instanceName: string;
  remoteJid: string;
  text: string;
  pushName?: string;
}) {
  const cfg = resolveEvolutionConfig();
  if (!cfg) return;

  const conn = await getConnectionByInstance(opts.instanceName);
  if (!conn) return;

  if (opts.remoteJid.includes("@g.us") || opts.remoteJid === "status@broadcast") {
    return;
  }

  const phone = normalizePhone(opts.remoteJid.split("@")[0] || "");
  if (!phone) return;

  if (!(await shouldProcessMessage(conn.tenantId, phone))) {
    return;
  }

  let client = await findClientByWhatsapp(conn.tenantId, phone);
  if (!client) {
    const name =
      opts.pushName?.trim() || `Cliente WhatsApp ${phone.slice(-4)}`;
    const [created] = await db
      .insert(clients)
      .values({
        tenantId: conn.tenantId,
        name,
        whatsapp: phone,
      })
      .returning();
    client = created;
  }

  const profile = await getOrCreateClientProfile(conn.tenantId, client.id);
  const text = opts.text.trim();

  // Retomar bot após handoff
  if (
    profile.onboardingStep === "human" &&
    (profile.onboardingStatus === "done" ||
      profile.onboardingStatus === "skipped")
  ) {
    if (isResumeBot(text)) {
      await db
        .update(clientProfiles)
        .set({ onboardingStep: "done", updatedAt: new Date() })
        .where(eq(clientProfiles.id, profile.id));
      await sendTextMessage(
        cfg,
        conn.instanceName,
        phone,
        "Assistente de volta! Posso indicar livros, buscar no acervo ou reservar. O que você procura?",
      );
      return;
    }
    // em handoff: não responde (humano atende), salvo se pedirem de novo
    if (isHandoffKeyword(text)) {
      await sendTextMessage(
        cfg,
        conn.instanceName,
        phone,
        "Já avisei o time. Se quiser o assistente automático de novo, digite *voltar bot*.",
      );
    }
    return;
  }

  const onboarded =
    profile.onboardingStatus === "done" ||
    profile.onboardingStatus === "skipped";

  if (!onboarded) {
    await runOnboardingFlow({
      cfg,
      tenantId: conn.tenantId,
      instanceName: conn.instanceName,
      phone,
      client,
      profile,
      text,
      pushName: opts.pushName,
    });
    return;
  }

  if (isPauseBot(text) || isHandoffKeyword(text)) {
    await db
      .update(clientProfiles)
      .set({ onboardingStep: "human", updatedAt: new Date() })
      .where(eq(clientProfiles.id, profile.id));
    const first = client.name.split(" ")[0] || "";
    await sendTextMessage(
      cfg,
      conn.instanceName,
      phone,
      isPauseBot(text)
        ? `Ok${first ? `, ${first}` : ""}! Assistente pausado. Digite *voltar bot* quando quiser indicações de novo.`
        : `Claro${first ? `, ${first}` : ""}! Vou chamar alguém do sebo. Digite *voltar bot* se quiser o assistente de volta.`,
    );
    return;
  }

  await runSalesAgent({
    cfg,
    tenantId: conn.tenantId,
    instanceName: conn.instanceName,
    phone,
    clientId: client.id,
    clientName: client.name,
    profileId: profile.id,
    budgetMin: profile.budgetMin,
    budgetMax: profile.budgetMax,
    text,
  });
}
