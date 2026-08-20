import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles } from "@/db/schema";
import { extractTopicQuery } from "@/lib/whatsapp/agent/text-utils";
import { setPendingSearch } from "@/lib/whatsapp/agent/debounce";
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
  if (nums.length === 1) {
    if (/at[eé]\s*\d+/i.test(text) || /no m[aá]ximo/i.test(text)) {
      return { min: null, max: nums[0] };
    }
    return { min: null, max: nums[0] };
  }
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

/** Pedido de livro/autor no meio do questionário. */
function shoppingTopic(text: string): string | null {
  const t = text.trim();
  if (
    /\b(quero|queria|gostaria|procuro|procurando|busco|buscando|tem |livro do|livros do|algo do|do autor)\b/i.test(
      t,
    )
  ) {
    const topic = extractTopicQuery(t);
    return topic.length >= 2 ? topic : null;
  }
  // Resposta curta que parece só autor (ex.: "CS Lewis", "Tolkien")
  if (
    t.length <= 40 &&
    !/,/.test(t) &&
    !/\b(romance|suspense|fic[cç][aã]o|hist[oó]ria|poesia|autoajuda)\b/i.test(
      t,
    ) &&
    /^[\p{L}\s.]+$/u.test(t) &&
    t.split(/\s+/).length <= 4
  ) {
    // deixa o fluxo normal de genres/themes tratar
    return null;
  }
  return null;
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
}): Promise<{ completed: boolean; pendingSearch: string | null }> {
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

  const shop = shoppingTopic(text);
  if (shop && (step === "genres" || step === "themes" || step === "welcome")) {
    await upsertInterestTags(
      opts.tenantId,
      opts.client.id,
      [shop.toLowerCase()],
      "declared",
      4,
    );
    await setPendingSearch(opts.tenantId, opts.phone, shop);
  }

  if (step === "welcome") {
    const first = opts.client.name.split(" ")[0] || "";
    reply =
      `Oi${first ? `, ${first}` : ""}! Obrigado pela compra 📚\n` +
      `Vamos montar seu perfil em 4 perguntas rápidas.\n\n` +
      `1) Quais *gêneros* você mais gosta? (ex.: romance, suspense, história)`;
    nextStep = "genres";
  } else if (step === "genres") {
    if (shop) {
      reply =
        `Anotei *${shop}* — assim que terminarmos o perfil eu olho na prateleira.\n\n` +
        `1b) Além disso, quais *gêneros* você mais gosta? (ex.: romance, suspense)`;
      nextStep = "genres";
    } else {
      const tags = parseTags(text).filter(
        (t) => !/quero|livro|gostaria|procuro/.test(t),
      );
      if (tags.length) {
        await upsertInterestTags(
          opts.tenantId,
          opts.client.id,
          tags,
          "declared",
          3,
        );
      }
      reply =
        `Anotado!\n\n2) Tem *autores ou temas* preferidos? (pode listar separados por vírgula)`;
      nextStep = "themes";
    }
  } else if (step === "themes") {
    if (shop) {
      reply =
        `Beleza, *${shop}* ficou no radar.\n\n` +
        `3) Qual sua *faixa de preço* usual? (ex.: até 40, ou 20 a 60)`;
      nextStep = "budget";
    } else {
      const tags = parseTags(text);
      if (tags.length && !isNo(text)) {
        await upsertInterestTags(
          opts.tenantId,
          opts.client.id,
          tags,
          "declared",
          2,
        );
      }
      reply =
        `Perfeito.\n\n3) Qual sua *faixa de preço* usual? (ex.: até 40, ou 20 a 60)`;
      nextStep = "budget";
    }
  } else if (step === "budget") {
    const b = parseBudget(text);
    profilePatch.budgetMin = b.min;
    profilePatch.budgetMax = b.max;
    // Avisos proativos de livro novo no Zap foram desligados (invasivos).
    profilePatch.optInNotices = false;
    reply =
      `Perfil pronto. Quando quiser, peça *indicações*, busque um título ou diga *menu* — eu respondo por aqui.`;
    nextStep = "done";
    onboardingStatus = "done";
  } else if (step === "optin") {
    // Fluxo antigo (ainda em andamento): não promete blast de novidades.
    profilePatch.optInNotices = false;
    reply =
      `Perfil pronto. Peça *indicações* ou diga o que procura — eu respondo quando você perguntar.`;
    nextStep = "done";
    onboardingStatus = "done";
  } else {
    return { completed: false, pendingSearch: null };
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

  return {
    completed: onboardingStatus === "done",
    pendingSearch: onboardingStatus === "done" ? shop : null,
  };
}
