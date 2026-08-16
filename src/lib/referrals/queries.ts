import { alias } from "drizzle-orm/pg-core";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { referralCredits, referrals, tenants } from "@/db/schema";
import { allocateUniqueReferralCode } from "@/lib/referrals/codes";
import { appPublicUrl } from "@/lib/stripe/client";

export async function ensureTenantReferralCode(tenantId: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      referralCode: tenants.referralCode,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;
  if (tenant.referralCode) return tenant.referralCode;

  const code = await allocateUniqueReferralCode();
  await db
    .update(tenants)
    .set({ referralCode: code, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
  return code;
}

export function referralSignupUrl(code: string, preferProduct?: string) {
  const base = appPublicUrl();
  if (preferProduct === "personal") {
    return `${base}/cadastro?produto=pessoal&ref=${encodeURIComponent(code)}`;
  }
  return `${base}/cadastro?ref=${encodeURIComponent(code)}`;
}

export async function listReferralsForTenant(tenantId: string) {
  return db
    .select({
      id: referrals.id,
      status: referrals.status,
      codeUsed: referrals.codeUsed,
      createdAt: referrals.createdAt,
      referredId: tenants.id,
      referredName: tenants.name,
      referredSlug: tenants.slug,
      referredProduct: tenants.product,
      referredPlan: tenants.planCode,
    })
    .from(referrals)
    .innerJoin(tenants, eq(tenants.id, referrals.referredTenantId))
    .where(eq(referrals.referrerTenantId, tenantId))
    .orderBy(desc(referrals.createdAt))
    .limit(100);
}

export async function referralCreditTotals(tenantId: string) {
  const [row] = await db
    .select({
      months: sql<number>`coalesce(sum(${referralCredits.creditMonths}), 0)`,
      brl: sql<string>`coalesce(sum(${referralCredits.creditBrl}), 0)`,
    })
    .from(referralCredits)
    .where(eq(referralCredits.tenantId, tenantId));
  return {
    months: Number(row?.months ?? 0),
    brl: Number(row?.brl ?? 0),
  };
}

export async function listAllReferralsAdmin(limit = 80) {
  const referrer = alias(tenants, "referrer");
  const referred = alias(tenants, "referred");
  return db
    .select({
      id: referrals.id,
      status: referrals.status,
      codeUsed: referrals.codeUsed,
      createdAt: referrals.createdAt,
      referrerName: referrer.name,
      referrerSlug: referrer.slug,
      referredName: referred.name,
      referredSlug: referred.slug,
    })
    .from(referrals)
    .innerJoin(referrer, eq(referrer.id, referrals.referrerTenantId))
    .innerJoin(referred, eq(referred.id, referrals.referredTenantId))
    .orderBy(desc(referrals.createdAt))
    .limit(limit);
}
