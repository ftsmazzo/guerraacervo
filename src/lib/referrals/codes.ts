import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { REFERRAL_CODE_LENGTH } from "@/lib/referrals/config";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newReferralCode(length = REFERRAL_CODE_LENGTH) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function normalizeReferralCode(raw: string | null | undefined) {
  const code = (raw || "").trim().toLowerCase();
  if (!code || code.length < 4 || code.length > 16) return null;
  if (!/^[a-z0-9]+$/.test(code)) return null;
  return code;
}

export async function allocateUniqueReferralCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = newReferralCode();
    const [taken] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.referralCode, code))
      .limit(1);
    if (!taken) return code;
  }
  return `${newReferralCode()}${Date.now().toString(36).slice(-4)}`.slice(0, 16);
}

export async function findTenantByReferralCode(code: string) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.referralCode, normalized))
    .limit(1);
  return row ?? null;
}
