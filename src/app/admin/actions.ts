"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  memberships,
  orderItems,
  orders,
  tenants,
  users,
  whatsappConnections,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getPlan, PLANS } from "@/lib/plans";
import { getRedis } from "@/lib/redis";
import { getStripe } from "@/lib/stripe/client";
import { provisionTenantAccount } from "@/lib/tenants/provision";
import {
  deleteInstance,
  instanceNameForSlug,
  logoutInstance,
  resolveEvolutionConfig,
} from "@/lib/whatsapp/evolution";

const STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "suspended",
] as const;

export type CreateTenantResult =
  | {
      ok: true;
      tenantId: string;
      slug: string;
      email: string;
      password: string;
    }
  | { ok: false; error: string };

/** Provisiona sebo + owner (conta SaaS). */
export async function createTenantAccount(input: {
  tenantName: string;
  slug?: string;
  ownerName: string;
  ownerEmail: string;
  password?: string;
  planCode?: string;
  trialDays?: number;
}): Promise<CreateTenantResult> {
  const ctx = await getAuthContext();
  if (!ctx?.user.isPlatformAdmin) {
    return { ok: false, error: "Não autorizado." };
  }

  const password =
    input.password?.trim() ||
    `Ga${Math.random().toString(36).slice(2, 8)}!`;

  const result = await provisionTenantAccount({
    tenantName: input.tenantName,
    slug: input.slug,
    ownerName: input.ownerName,
    ownerEmail: input.ownerEmail,
    password,
    planCode: input.planCode?.trim() || "business_trial",
    trialDays: input.trialDays,
    status: "trialing",
  });

  if (!result.ok) return result;

  revalidatePath("/admin");
  revalidatePath("/admin/tenants");

  return {
    ok: true,
    tenantId: result.tenantId,
    slug: result.slug,
    email: result.email,
    password,
  };
}

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

export type DeleteTenantResult = { ok: true } | { ok: false; error: string };

/** Apaga a conta e dados ligados (livros, pedidos, clientes, WhatsApp, users órfãos). */
export async function deleteTenantAccount(
  tenantId: string,
): Promise<DeleteTenantResult> {
  await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return { ok: false, error: "Conta inválida." };
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return { ok: false, error: "Conta não encontrada." };

  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.tenantId, tenantId));
  const memberUserIds = [...new Set(memberRows.map((m) => m.userId))];

  const [wa] = await db
    .select({ instanceName: whatsappConnections.instanceName })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.tenantId, tenantId))
    .limit(1);

  const cfg = resolveEvolutionConfig();
  if (cfg) {
    const instance = wa?.instanceName || instanceNameForSlug(tenant.slug);
    await logoutInstance(cfg, instance).catch(() => null);
    await deleteInstance(cfg, instance).catch(() => null);
  }

  const stripe = getStripe();
  if (stripe && tenant.stripeSubscriptionId) {
    await stripe.subscriptions
      .cancel(tenant.stripeSubscriptionId)
      .catch(() => null);
  }

  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    await redis.del(`ga:tenant:${tenantId}:push_subs`).catch(() => null);
    await redis.del(`ga:tenant:${tenantId}:alerts`).catch(() => null);
  } catch {
    // Redis opcional na exclusão
  }

  try {
    await db.transaction(async (tx) => {
      const tenantOrders = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.tenantId, tenantId));
      const orderIds = tenantOrders.map((o) => o.id);
      if (orderIds.length) {
        await tx
          .delete(orderItems)
          .where(inArray(orderItems.orderId, orderIds));
        await tx.delete(orders).where(inArray(orders.id, orderIds));
      }

      await tx.delete(tenants).where(eq(tenants.id, tenantId));

      for (const userId of memberUserIds) {
        const [stillMember] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(eq(memberships.userId, userId))
          .limit(1);
        if (stillMember) continue;
        await tx
          .delete(users)
          .where(
            and(eq(users.id, userId), eq(users.isPlatformAdmin, false)),
          );
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao excluir: ${msg}` };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
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
