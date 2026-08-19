import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles, tenants } from "@/db/schema";
import {
  getSuggestedBooks,
  shouldProcessMessage,
  takePendingSearch,
} from "@/lib/whatsapp/agent/debounce";
import { pauseBotAndNotifyHandoff } from "@/lib/whatsapp/agent/handoff";
import { runSalesAgent } from "@/lib/whatsapp/agent/sales";
import {
  getWaLane,
  looksLikeCatalogQuery,
  parseTriageChoice,
  replyGuestCatalog,
  setWaLane,
  triageMenuText,
} from "@/lib/whatsapp/agent/triage";
import {
  normalizePhone,
  resolveEvolutionConfig,
  sendComposing,
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
  return /voltar\s*bot|reativar\s*bot/i.test(text.trim());
}

function isGreeting(text: string) {
  const t = text.trim();
  return /^(menu|ajuda|help|oi|ol[aá]|ola|bom dia|boa tarde|boa noite)[.!?]*$/i.test(
    t,
  );
}

async function seboName(tenantId: string) {
  const [row] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row?.name || "nosso sebo";
}

async function shouldSkipTriage(
  tenantId: string,
  phone: string,
  text: string,
) {
  if (isHandoffKeyword(text) || isPauseBot(text) || isResumeBot(text)) {
    return true;
  }
  if (/\b(reservar|pedido|rastreio|status|andamento)\b/i.test(text)) {
    return true;
  }
  const suggested = await getSuggestedBooks(tenantId, phone);
  if (
    suggested.length &&
    /^(esse|essa|este|1|2|3)([.!)])?$/i.test(text.trim())
  ) {
    return true;
  }
  return false;
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

  const phone = normalizePhone(opts.remoteJid);
  if (!phone) {
    console.warn("[whatsapp] telefone inválido/LID sem alt:", opts.remoteJid);
    return;
  }

  void sendComposing(cfg, conn.instanceName, phone);

  const text = opts.text.trim();
  const client = await findClientByWhatsapp(conn.tenantId, phone);

  if (!client) {
    if (!(await shouldProcessMessage(conn.tenantId, phone))) return;
    await handleGuest({
      cfg,
      tenantId: conn.tenantId,
      instanceName: conn.instanceName,
      phone,
      text,
      pushName: opts.pushName,
    });
    return;
  }

  const profile = await getOrCreateClientProfile(conn.tenantId, client.id);
  const onboardingBusy = profile.onboardingStatus === "in_progress";

  if (!onboardingBusy) {
    if (!(await shouldProcessMessage(conn.tenantId, phone))) return;
  }

  if (
    profile.onboardingStep === "human" &&
    (profile.onboardingStatus === "done" ||
      profile.onboardingStatus === "skipped" ||
      profile.onboardingStatus === "pending")
  ) {
    if (isResumeBot(text)) {
      await db
        .update(clientProfiles)
        .set({ onboardingStep: "done", updatedAt: new Date() })
        .where(eq(clientProfiles.id, profile.id));
      await setWaLane(conn.tenantId, phone, "buy");
      await sendTextMessage(
        cfg,
        conn.instanceName,
        phone,
        "Assistente de volta! Posso indicar livros, buscar no acervo ou reservar. O que você procura?",
      );
      return;
    }
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

  if (profile.onboardingStatus === "in_progress") {
    const result = await runOnboardingFlow({
      cfg,
      tenantId: conn.tenantId,
      instanceName: conn.instanceName,
      phone,
      client,
      profile,
      text,
      pushName: opts.pushName,
    });

    if (result.completed) {
      const pending =
        (await takePendingSearch(conn.tenantId, phone)) ||
        result.pendingSearch;
      if (pending) {
        const [fresh] = await db
          .select()
          .from(clientProfiles)
          .where(eq(clientProfiles.id, profile.id))
          .limit(1);
        await setWaLane(conn.tenantId, phone, "buy");
        await runSalesAgent({
          cfg,
          tenantId: conn.tenantId,
          instanceName: conn.instanceName,
          phone,
          clientId: client.id,
          clientName: client.name,
          profileId: profile.id,
          budgetMin: fresh?.budgetMin ?? profile.budgetMin,
          budgetMax: fresh?.budgetMax ?? profile.budgetMax,
          text: pending,
        });
      }
    }
    return;
  }

  if (isPauseBot(text)) {
    await db
      .update(clientProfiles)
      .set({ onboardingStep: "human", updatedAt: new Date() })
      .where(eq(clientProfiles.id, profile.id));
    const first = client.name.split(" ")[0] || "";
    await sendTextMessage(
      cfg,
      conn.instanceName,
      phone,
      `Ok${first ? `, ${first}` : ""}! Assistente pausado. Digite *voltar bot* quando quiser indicações de novo.`,
    );
    return;
  }

  if (isHandoffKeyword(text)) {
    await pauseBotAndNotifyHandoff({
      cfg,
      tenantId: conn.tenantId,
      instanceName: conn.instanceName,
      phone,
      clientName: client.name,
      clientId: client.id,
      profileId: profile.id,
      preview: text,
      reason: "atendente",
    });
    return;
  }

  const name = await seboName(conn.tenantId);
  const lane = await getWaLane(conn.tenantId, phone);
  const choice = parseTriageChoice(text);
  const inTriage = !lane || lane === "awaiting";
  const numericPick = /^[123]$/.test(text.trim());

  if (isGreeting(text) && !choice) {
    await setWaLane(conn.tenantId, phone, "awaiting");
    await sendTextMessage(
      cfg,
      conn.instanceName,
      phone,
      triageMenuText(name),
    );
    return;
  }

  if (choice === "sell" && (inTriage || !numericPick)) {
    await pauseBotAndNotifyHandoff({
      cfg,
      tenantId: conn.tenantId,
      instanceName: conn.instanceName,
      phone,
      clientName: client.name,
      clientId: client.id,
      profileId: profile.id,
      preview: text,
      reason: "sell",
    });
    return;
  }

  if (inTriage && (choice === "buy" || choice === "catalog")) {
    await setWaLane(conn.tenantId, phone, choice);
    if (choice === "catalog") {
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
        text: "indicações",
      });
      return;
    }
    await sendTextMessage(
      cfg,
      conn.instanceName,
      phone,
      `Beleza. Me fala um autor, um título ou um tema — ou *indicações* que eu puxo do seu gosto.`,
    );
    return;
  }

  const skip = await shouldSkipTriage(conn.tenantId, phone, text);
  if (!lane && !skip) {
    if (looksLikeCatalogQuery(text)) {
      await setWaLane(conn.tenantId, phone, "buy");
    } else {
      await setWaLane(conn.tenantId, phone, "awaiting");
      await sendTextMessage(
        cfg,
        conn.instanceName,
        phone,
        triageMenuText(name),
      );
      return;
    }
  }

  if (lane === "awaiting" && !skip && !looksLikeCatalogQuery(text)) {
    await sendTextMessage(
      cfg,
      conn.instanceName,
      phone,
      triageMenuText(name),
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

async function handleGuest(opts: {
  cfg: NonNullable<ReturnType<typeof resolveEvolutionConfig>>;
  tenantId: string;
  instanceName: string;
  phone: string;
  text: string;
  pushName?: string;
}) {
  const name = await seboName(opts.tenantId);
  const display = opts.pushName?.trim() || opts.phone;
  const lane = await getWaLane(opts.tenantId, opts.phone);
  const choice = parseTriageChoice(opts.text);
  const inTriage = !lane || lane === "awaiting";
  const numericPick = /^[123]$/.test(opts.text.trim());

  if (isGreeting(opts.text) && !choice) {
    await setWaLane(opts.tenantId, opts.phone, "awaiting");
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      triageMenuText(name),
    );
    return;
  }

  if (choice === "sell" && (inTriage || !numericPick)) {
    await pauseBotAndNotifyHandoff({
      cfg: opts.cfg,
      tenantId: opts.tenantId,
      instanceName: opts.instanceName,
      phone: opts.phone,
      clientName: display,
      preview: opts.text,
      reason: "sell",
    });
    return;
  }

  if (inTriage && (choice === "buy" || choice === "catalog")) {
    await setWaLane(opts.tenantId, opts.phone, choice);
    if (choice === "catalog") {
      await replyGuestCatalog({
        cfg: opts.cfg,
        instanceName: opts.instanceName,
        tenantId: opts.tenantId,
        phone: opts.phone,
        query: "",
      });
      return;
    }
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      "Me fala um autor, um título ou um tema que eu olho no acervo.\nReserva só depois do cadastro no sebo.",
    );
    return;
  }

  if (lane === "buy" || lane === "catalog") {
    await replyGuestCatalog({
      cfg: opts.cfg,
      instanceName: opts.instanceName,
      tenantId: opts.tenantId,
      phone: opts.phone,
      query: opts.text,
    });
    return;
  }

  if (lane === "awaiting" && looksLikeCatalogQuery(opts.text)) {
    await setWaLane(opts.tenantId, opts.phone, "catalog");
    await replyGuestCatalog({
      cfg: opts.cfg,
      instanceName: opts.instanceName,
      tenantId: opts.tenantId,
      phone: opts.phone,
      query: opts.text,
    });
    return;
  }

  await setWaLane(opts.tenantId, opts.phone, "awaiting");
  await sendTextMessage(
    opts.cfg,
    opts.instanceName,
    opts.phone,
    triageMenuText(name),
  );
}
