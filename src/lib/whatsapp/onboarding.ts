import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles } from "@/db/schema";
import type { EvolutionConfig } from "@/lib/whatsapp/evolution";
import { sendTextMessage } from "@/lib/whatsapp/evolution";
import { upsertInterestTags } from "@/lib/whatsapp/queries";

type Step =
  | "welcome"
  | "genres"
  | "themes"
  | "budget"
  | "optin"
  | "done";

function parseBudget(text: string): { min: number | null; max: number | null } {
  const nums = text.replace(/\./g, "").match(/\d+/g)?.map(Number) || [];
  if (nums.length >= 2) return { min: nums[0], max: nums[1] };
  if (nums.length === 1) return { min: null, max: nums[0] };
  return { min: null, max: null };
}

function parseTags(text: string): string[] {
  return text
    .split(/[,;/]| e /i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1 && t.length <= 40)
    .slice(0, 8);
}

function isNo(text: string) {
  return /^(n|nao|não|no|nunca|depois)\b/i.test(text.trim());
}

export async function runOnboardingFlow(opts: {
  cfg: EvolutionConfig;
  tenantId: string;
  instanceName: string;
  phone: string;
  client: { id: string; name: string };
  profile: {
    id: string;
    budgetMin: number | null;
    budgetMax: number | null;
    optInNotices: boolean;
    onboardingStep: string | null;
  };
  text: string;
  pushName?: string;
}) {
  const step = (opts.profile.onboardingStep as Step) || "welcome";
  const text = opts.text.trim();

  let reply = "";
  let nextStep: Step = step;
  let onboardingStatus: "pending" | "in_progress" | "done" | "skipped" =
    "in_progress";
  const profilePatch: Partial<{
    budgetMin: number | null;
    budgetMax: number | null;
    optInNotices: boolean;
  }> = {};

  if (step === "welcome") {
    reply =
      `Olá${opts.pushName ? `, ${opts.pushName}` : ""}! Sou o assistente do sebo 📚\n` +
      `Vamos montar seu perfil em 4 perguntas rápidas.\n\n` +
      `1) Quais *gêneros* você mais gosta? (ex.: romance, suspense, história)`;
    nextStep = "genres";
  } else if (step === "genres") {
    const tags = parseTags(text);
    if (tags.length) {
      await upsertInterestTags(opts.tenantId, opts.client.id, tags, "declared", 3);
    }
    reply =
      `Anotado!\n\n2) Tem *autores ou temas* preferidos? (pode listar separados por vírgula)`;
    nextStep = "themes";
  } else if (step === "themes") {
    const tags = parseTags(text);
    if (tags.length) {
      await upsertInterestTags(opts.tenantId, opts.client.id, tags, "declared", 2);
    }
    reply =
      `Perfeito.\n\n3) Qual sua *faixa de preço* usual? (ex.: até 40, ou 20 a 60)`;
    nextStep = "budget";
  } else if (step === "budget") {
    const b = parseBudget(text);
    profilePatch.budgetMin = b.min;
    profilePatch.budgetMax = b.max;
    reply =
      `4) Posso te avisar no WhatsApp quando entrar *livro novo* no seu gosto? (sim/não)`;
    nextStep = "optin";
  } else if (step === "optin") {
    profilePatch.optInNotices = !isNo(text);
    reply = isNo(text)
      ? `Tudo bem! Perfil pronto. Pode pedir *indicações*, buscar um título ou *menu*.`
      : `Combinado! Vou te avisar das novidades. Perfil pronto — peça *indicações* ou diga o que procura 📖`;
    nextStep = "done";
    onboardingStatus = "done";
  } else {
    return;
  }

  await db
    .update(clientProfiles)
    .set({
      onboardingStatus,
      onboardingStep: nextStep,
      budgetMin: profilePatch.budgetMin ?? opts.profile.budgetMin,
      budgetMax: profilePatch.budgetMax ?? opts.profile.budgetMax,
      optInNotices: profilePatch.optInNotices ?? opts.profile.optInNotices,
      updatedAt: new Date(),
    })
    .where(eq(clientProfiles.id, opts.profile.id));

  if (reply) {
    await sendTextMessage(opts.cfg, opts.instanceName, opts.phone, reply);
  }
}
