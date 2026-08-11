import bcrypt from "bcryptjs";
import { getRedis } from "@/lib/redis";
import {
  isBusinessPlanCode,
  type BusinessPlanCode,
} from "@/lib/stripe/client";

export type PendingSignup = {
  tenantName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
  ownerWhatsapp: string;
  planCode: BusinessPlanCode;
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
}): Promise<{ ok: true; draft: PendingSignup } | { ok: false; error: string }> {
  if (!isBusinessPlanCode(input.planCode)) {
    return { ok: false, error: "Escolha um plano Negócio válido." };
  }
  const password = input.password.trim();
  if (password.length < 6) {
    return { ok: false, error: "Senha com pelo menos 6 caracteres." };
  }
  const phone = input.ownerWhatsapp.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 13) {
    return { ok: false, error: "WhatsApp inválido." };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const slugBase = (input.slug || input.tenantName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const slug = slugBase.startsWith("sebo-")
    ? slugBase
    : `sebo-${slugBase || "novo"}`.slice(0, 60);

  return {
    ok: true,
    draft: {
      tenantName: input.tenantName.trim(),
      slug,
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      passwordHash,
      ownerWhatsapp: phone.startsWith("55") ? phone : `55${phone}`,
      planCode: input.planCode,
      otpVerified: false,
      createdAt: Date.now(),
    },
  };
}
