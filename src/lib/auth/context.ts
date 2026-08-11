import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { readSessionFromCookies } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/auth/types";
import { getPlan, planHas, type Entitlement } from "@/lib/plans";

export type AuthContext = {
  session: SessionPayload;
  user: {
    id: string;
    email: string;
    name: string;
    isPlatformAdmin: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    planCode: string;
    planName: string;
    status: string;
    trialEndsAt: Date | null;
    storeEnabled: boolean;
    product: string;
  } | null;
  role: string | null;
};

export function isTrialActive(tenant: {
  status: string;
  trialEndsAt: Date | null;
}): boolean {
  if (tenant.status !== "trialing") return false;
  if (!tenant.trialEndsAt) return true;
  return tenant.trialEndsAt.getTime() > Date.now();
}

export function tenantAccessOk(tenant: {
  status: string;
  trialEndsAt: Date | null;
}): { ok: boolean; reason?: string } {
  if (tenant.status === "suspended") {
    return { ok: false, reason: "Conta suspensa." };
  }
  if (tenant.status === "canceled") {
    return { ok: false, reason: "Assinatura cancelada." };
  }
  if (tenant.status === "past_due") {
    return { ok: false, reason: "Pagamento em atraso." };
  }
  if (tenant.status === "trialing" && !isTrialActive(tenant)) {
    return { ok: false, reason: "Período de teste encerrado." };
  }
  if (
    tenant.status !== "trialing" &&
    tenant.status !== "active" &&
    tenant.status !== "past_due"
  ) {
    return { ok: false, reason: "Status da conta inválido." };
  }
  return { ok: true };
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await readSessionFromCookies();
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) return null;

  let tenant: AuthContext["tenant"] = null;
  let role: string | null = session.role;

  if (session.tenantId) {
    const [match] = await db
      .select({
        tenant: tenants,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.tenantId, session.tenantId),
        ),
      )
      .limit(1);

    if (match) {
      const plan = getPlan(match.tenant.planCode);
      role = match.role;
      tenant = {
        id: match.tenant.id,
        name: match.tenant.name,
        slug: match.tenant.slug,
        planCode: match.tenant.planCode,
        planName: plan?.name ?? match.tenant.planCode,
        status: match.tenant.status,
        trialEndsAt: match.tenant.trialEndsAt,
        storeEnabled: match.tenant.storeEnabled,
        product: match.tenant.product,
      };
    }
  }

  return {
    session,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
    },
    tenant,
    role,
  };
}

export function hasEntitlement(
  planCode: string | null | undefined,
  entitlement: Entitlement,
): boolean {
  if (!planCode) return false;
  return planHas(planCode, entitlement);
}
