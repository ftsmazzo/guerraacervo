"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getPlan, PLANS } from "@/lib/plans";

const STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "suspended",
] as const;

function slugify(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

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

  const tenantName = input.tenantName.trim();
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const planCode = input.planCode?.trim() || "business_trial";
  const plan = getPlan(planCode);
  if (!plan) return { ok: false, error: "Plano inválido." };
  if (!tenantName) return { ok: false, error: "Nome do sebo obrigatório." };
  if (!ownerName) return { ok: false, error: "Nome do responsável obrigatório." };
  if (!ownerEmail || !ownerEmail.includes("@")) {
    return { ok: false, error: "E-mail inválido." };
  }

  let slug = slugify(input.slug?.trim() || tenantName);
  if (!slug) return { ok: false, error: "Slug inválido." };
  if (!slug.startsWith("sebo-") && plan.product === "business") {
    slug = `sebo-${slug}`.slice(0, 60);
  }

  const password =
    input.password?.trim() ||
    `Ga${Math.random().toString(36).slice(2, 8)}!`;
  if (password.length < 6) {
    return { ok: false, error: "Senha com pelo menos 6 caracteres." };
  }

  const [emailTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (emailTaken) {
    return { ok: false, error: "Já existe usuário com este e-mail." };
  }

  const [slugTaken] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (slugTaken) {
    return { ok: false, error: `Slug "${slug}" já está em uso.` };
  }

  const trialDays = Math.max(
    1,
    Math.min(90, Math.floor(input.trialDays ?? plan.trialDays ?? 14)),
  );
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + trialDays);

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [user] = await db
      .insert(users)
      .values({
        email: ownerEmail,
        name: ownerName,
        passwordHash,
        isPlatformAdmin: false,
      })
      .returning();

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: tenantName,
        slug,
        product: plan.product,
        planCode: plan.code,
        status: "trialing",
        trialEndsAt: trialEnds,
        storeEnabled: plan.product === "business",
      })
      .returning();

    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });

    revalidatePath("/admin");
    revalidatePath("/admin/tenants");

    return {
      ok: true,
      tenantId: tenant.id,
      slug: tenant.slug,
      email: ownerEmail,
      password,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao criar conta: ${msg}` };
  }
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
