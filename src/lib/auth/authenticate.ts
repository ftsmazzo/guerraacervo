import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { getPlan } from "@/lib/plans";
import type { SessionPayload } from "@/lib/auth/types";

export async function authenticateUser(
  email: string,
  password: string,
): Promise<{ ok: true; session: SessionPayload } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false, error: "Informe e-mail e senha." };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (!user) {
    return { ok: false, error: "Credenciais inválidas." };
  }

  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Credenciais inválidas." };
  }

  const membershipRows = await db
    .select({
      tenant: tenants,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, user.id))
    .limit(10);

  const primary = membershipRows[0];
  const plan = primary ? getPlan(primary.tenant.planCode) : undefined;

  const session: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
    tenantId: primary?.tenant.id ?? null,
    tenantSlug: primary?.tenant.slug ?? null,
    tenantName: primary?.tenant.name ?? null,
    planCode: primary?.tenant.planCode ?? null,
    planName: plan?.name ?? null,
    role: primary?.role ?? null,
    tenantStatus: primary?.tenant.status ?? null,
    trialEndsAt: primary?.tenant.trialEndsAt?.toISOString() ?? null,
  };

  return { ok: true, session };
}

export async function sessionForUser(
  userId: string,
): Promise<SessionPayload | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const membershipRows = await db
    .select({
      tenant: tenants,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, user.id))
    .limit(10);

  const primary = membershipRows[0];
  const plan = primary ? getPlan(primary.tenant.planCode) : undefined;

  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
    tenantId: primary?.tenant.id ?? null,
    tenantSlug: primary?.tenant.slug ?? null,
    tenantName: primary?.tenant.name ?? null,
    planCode: primary?.tenant.planCode ?? null,
    planName: plan?.name ?? null,
    role: primary?.role ?? null,
    tenantStatus: primary?.tenant.status ?? null,
    trialEndsAt: primary?.tenant.trialEndsAt?.toISOString() ?? null,
  };
}
