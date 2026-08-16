import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referrals } from "@/db/schema";
import { findTenantByReferralCode } from "@/lib/referrals/codes";

export async function attachReferralOnSignup(opts: {
  referredTenantId: string;
  code?: string | null;
}) {
  const code = opts.code?.trim().toLowerCase();
  if (!code) return { ok: false as const, skipped: true };

  const referrer = await findTenantByReferralCode(code);
  if (!referrer) return { ok: false as const, skipped: true };
  if (referrer.id === opts.referredTenantId) {
    return { ok: false as const, skipped: true };
  }

  const [existing] = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(eq(referrals.referredTenantId, opts.referredTenantId))
    .limit(1);
  if (existing) return { ok: true as const, already: true };

  try {
    await db.insert(referrals).values({
      referrerTenantId: referrer.id,
      referredTenantId: opts.referredTenantId,
      codeUsed: code,
      status: "signed_up",
    });
    return { ok: true as const };
  } catch (e) {
    console.warn(
      "[referral] attach",
      e instanceof Error ? e.message : e,
    );
    return { ok: false as const, skipped: true };
  }
}
