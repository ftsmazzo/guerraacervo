import bcrypt from "bcryptjs";
import { getRedis } from "@/lib/redis";
import { getPlan, isSignupPlanCode } from "@/lib/plans";
import { slugifyTenant } from "@/lib/tenants/provision";
import { normalizeReferralCode } from "@/lib/referrals/codes";

export type PendingSignup = {
  tenantName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
  ownerWhatsapp: string;
  planCode: string;
  referralCode: string | null;
  otpVerified: boolean;
  createdAt: number;
};

function draftKey(id: string) {
  return `ga:signup:draft:${id}`;
}

function otpKey(phone: string) {
  return `ga:signup:otp:${phone}`;
}

function verifiedKey(id: string) {
  return `ga:signup:verified:${id}`;
}

export function newDraftId() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveSignupDraft(
  id: string,
  data: PendingSignup,
): Promise<void> {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(draftKey(id), JSON.stringify(data), "EX", 60 * 60 * 2);
}

export async function getSignupDraft(
  id: string,
): Promise<PendingSignup | null> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const raw = await redis.get(draftKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as PendingSignup;
  } catch {
    return null;
  }
}

export async function deleteSignupDraft(id: string) {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    await redis.del(draftKey(id), verifiedKey(id));
  } catch {
    // ignore
  }
}

export async function setOtpCode(phone: string, code: string) {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(otpKey(phone), code, "EX", 60 * 10);
}

export async function consumeOtpCode(phone: string, code: string) {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  const key = otpKey(phone);
  const stored = await redis.get(key);
  if (!stored || stored !== code) return false;
  await redis.del(key);
  return true;
}

export async function markDraftOtpVerified(id: string) {
  const draft = await getSignupDraft(id);
  if (!draft) return false;
  draft.otpVerified = true;
  await saveSignupDraft(id, draft);
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(verifiedKey(id), "1", "EX", 60 * 60);
  return true;
}

export async function isDraftOtpVerified(id: string) {
  const draft = await getSignupDraft(id);
  return Boolean(draft?.otpVerified);
}

export async function buildSignupDraft(input: {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  ownerWhatsapp: string;
  planCode: string;
  slug?: string;
  referralCode?: string | null;
}): Promise<{ ok: true; draft: PendingSignup } | { ok: false; error: string }> {
  if (!isSignupPlanCode(input.planCode)) {
    return { ok: false, error: "Escolha um plano válido." };
  }
  const plan = getPlan(input.planCode)!;
  const password = input.password.trim();
  if (password.length < 6) {
    return { ok: false, error: "Senha com pelo menos 6 caracteres." };
  }
  const phone = input.ownerWhatsapp.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 13) {
    return { ok: false, error: "WhatsApp inválido." };
  }
  const ownerName = input.ownerName.trim();
  if (!ownerName) {
    return { ok: false, error: "Informe seu nome." };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const tenantName =
    input.tenantName.trim() ||
    (plan.product === "personal" ? `Biblioteca de ${ownerName}` : "");
  if (!tenantName) {
    return {
      ok: false,
      error:
        plan.product === "library"
          ? "Informe o nome da biblioteca."
          : "Informe o nome do sebo.",
    };
  }

  let slug = slugifyTenant(input.slug?.trim() || tenantName);
  if (!slug) {
    return { ok: false, error: "Identificador inválido." };
  }
  if (plan.product === "business" && !slug.startsWith("sebo-")) {
    slug = `sebo-${slug}`.slice(0, 60);
  }
  if (plan.product === "library" && !slug.startsWith("bib-")) {
    slug = `bib-${slug}`.slice(0, 60);
  }

  return {
    ok: true,
    draft: {
      tenantName,
      slug,
      ownerName,
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      passwordHash,
      ownerWhatsapp: phone.startsWith("55") ? phone : `55${phone}`,
      planCode: input.planCode,
      referralCode: normalizeReferralCode(input.referralCode),
      otpVerified: false,
      createdAt: Date.now(),
    },
  };
}
