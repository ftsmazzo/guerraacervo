import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referralCredits, referrals, tenants } from "@/db/schema";
import { getPlan } from "@/lib/plans";
import type { ReferralRewardConfig } from "@/lib/referrals/config";
import { loadReferralRewards } from "@/lib/referrals/settings";

function pickRule(
  rewards: ReferralRewardConfig,
  referrerProduct: string,
  referredProduct: string,
) {
  if (referrerProduct === "personal" && referredProduct === "business") {
    return rewards.userRefersBusiness;
  }
  if (referrerProduct === "business" && referredProduct === "personal") {
    return rewards.businessRefersUser;
  }
  if (referrerProduct === "business" && referredProduct === "business") {
    return rewards.businessRefersBusiness;
  }
  return rewards.userRefersUser;
}

function computeReward(opts: {
  rule: ReturnType<typeof pickRule>;
  referrerPrice: number;
  referredPrice: number;
}) {
  const { rule, referrerPrice, referredPrice } = opts;
  if (rule.type === "months") {
    if (referrerPrice <= 0) {
      return { months: 0, brl: 0 };
    }
    const raw = Math.floor(referredPrice / referrerPrice);
    const months = Math.max(0, Math.min(rule.capMonths, raw || 0));
    return { months, brl: 0 };
  }
  return { months: 0, brl: Math.max(0, referredPrice) };
}

function addMonths(from: Date, months: number) {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Idempotente: só credita no 1º pagamento do indicado. Trial não gera prêmio. */
export async function grantReferralRewardOnFirstPayment(referredTenantId: string) {
  const [row] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referredTenantId, referredTenantId))
    .limit(1);
  if (!row) return { ok: false as const, skipped: true };
  if (row.status === "rewarded") return { ok: true as const, already: true };

  const [referrer] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, row.referrerTenantId))
    .limit(1);
  const [referred] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, row.referredTenantId))
    .limit(1);
  if (!referrer || !referred) return { ok: false as const, skipped: true };

  const referrerPlan = getPlan(referrer.planCode);
  const referredPlan = getPlan(referred.planCode);
  const referrerPrice = referrerPlan?.priceMonthlyBrl ?? 0;
  const referredPrice = referredPlan?.priceMonthlyBrl ?? 0;
  if (!referredPrice || referredPrice <= 0) {
    return { ok: false as const, skipped: true };
  }

  const rewards = await loadReferralRewards();
  const rule = pickRule(rewards, referrer.product, referred.product);
  const reward = computeReward({
    rule,
    referrerPrice: referrerPrice || 0,
    referredPrice,
  });
  if (reward.months <= 0 && reward.brl <= 0) {
    await db
      .update(referrals)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(referrals.id, row.id));
    return { ok: false as const, skipped: true };
  }

  const now = new Date();
  const settings = {
    ...((referrer.settings || {}) as Record<string, unknown>),
  };
  const previousBrl = Number(settings.billingCreditBrl || 0) || 0;
  if (reward.brl > 0) {
    settings.billingCreditBrl = Number((previousBrl + reward.brl).toFixed(2));
  }

  let trialEndsAt = referrer.trialEndsAt;
  if (reward.months > 0) {
    const base =
      trialEndsAt && trialEndsAt.getTime() > now.getTime() ? trialEndsAt : now;
    trialEndsAt = addMonths(base, reward.months);
    const prevMonths = Number(settings.referralCreditMonths || 0) || 0;
    settings.referralCreditMonths = prevMonths + reward.months;
    if (referrer.status === "active") {
      const prevThrough = settings.paidThrough
        ? new Date(String(settings.paidThrough))
        : now;
      const from =
        prevThrough.getTime() > now.getTime() ? prevThrough : now;
      settings.paidThrough = addMonths(from, reward.months).toISOString();
    }
  }

  await db
    .update(tenants)
    .set({
      trialEndsAt,
      settings,
      updatedAt: now,
    })
    .where(eq(tenants.id, referrer.id));

  await db.insert(referralCredits).values({
    tenantId: referrer.id,
    referralId: row.id,
    creditMonths: reward.months,
    creditBrl: reward.brl.toFixed(2),
    appliedAt: now,
    notes: `${referrer.product}->${referred.product} ${referred.planCode}`,
  });

  await db
    .update(referrals)
    .set({ status: "rewarded", updatedAt: now })
    .where(eq(referrals.id, row.id));

  return { ok: true as const, months: reward.months, brl: reward.brl };
}
