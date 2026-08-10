"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getPlan, PLANS } from "@/lib/plans";

const STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "suspended",
] as const;

export async function updateTenantPlan(tenantId: string, planCode: string) {
  await requirePlatformAdmin();
  if (!PLANS[planCode]) throw new Error("Plano inválido");
  const plan = getPlan(planCode)!;
  await db
    .update(tenants)
    .set({
      planCode,
      product: plan.product,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function updateTenantStatus(
  tenantId: string,
  status: (typeof STATUSES)[number],
) {
  await requirePlatformAdmin();
  if (!STATUSES.includes(status)) throw new Error("Status inválido");
  await db
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function blockTenant(tenantId: string) {
  await updateTenantStatus(tenantId, "suspended");
}

export async function unblockTenant(tenantId: string) {
  await requirePlatformAdmin();
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!t) throw new Error("Tenant não encontrado");
  const stillTrial =
    t.trialEndsAt && t.trialEndsAt.getTime() > Date.now()
      ? "trialing"
      : "active";
  await db
    .update(tenants)
    .set({ status: stillTrial, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function extendTrial(tenantId: string, days: number) {
  await requirePlatformAdmin();
  const n = Math.max(1, Math.min(90, Math.floor(days)));
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!t) throw new Error("Tenant não encontrado");
  const base =
    t.trialEndsAt && t.trialEndsAt.getTime() > Date.now()
      ? t.trialEndsAt
      : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + n);
  await db
    .update(tenants)
    .set({
      trialEndsAt: next,
      status: "trialing",
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function getAdminStats() {
  await requirePlatformAdmin();
  const rows = await db
    .select({
      status: tenants.status,
      n: sql<number>`count(*)::int`,
    })
    .from(tenants)
    .groupBy(tenants.status);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.status] = Number(r.n);
  return {
    total: Object.values(map).reduce((a, b) => a + b, 0),
    active: map.active ?? 0,
    trialing: map.trialing ?? 0,
    past_due: map.past_due ?? 0,
    suspended: map.suspended ?? 0,
    canceled: map.canceled ?? 0,
  };
}
