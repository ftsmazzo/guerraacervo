import { redirect } from "next/navigation";
import {
  getAuthContext,
  hasEntitlement,
  tenantAccessOk,
  type AuthContext,
} from "@/lib/auth/context";
import type { Entitlement } from "@/lib/plans";

export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login?next=/admin");
  if (!ctx.user.isPlatformAdmin) redirect("/painel");
  return ctx;
}

export async function requireTenantWrite(
  entitlement?: Entitlement,
): Promise<AuthContext & { tenant: NonNullable<AuthContext["tenant"]> }> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login?next=/painel");
  if (!ctx.tenant) {
    throw new Error("TENANT_REQUIRED");
  }
  const access = tenantAccessOk(ctx.tenant);
  if (!access.ok) {
    throw new Error(access.reason ?? "TENANT_BLOCKED");
  }
  if (ctx.role === "readonly") {
    throw new Error("Somente leitura.");
  }
  if (entitlement && !hasEntitlement(ctx.tenant.planCode, entitlement)) {
    throw new Error(`Plano sem permissão: ${entitlement}`);
  }
  return ctx as AuthContext & { tenant: NonNullable<AuthContext["tenant"]> };
}

export function assertTenantCanWrite(
  ctx: AuthContext,
  entitlement?: Entitlement,
): asserts ctx is AuthContext & { tenant: NonNullable<AuthContext["tenant"]> } {
  if (!ctx.tenant) throw new Error("TENANT_REQUIRED");
  const access = tenantAccessOk(ctx.tenant);
  if (!access.ok) throw new Error(access.reason ?? "TENANT_BLOCKED");
  if (ctx.role === "readonly") throw new Error("Somente leitura.");
  if (entitlement && !hasEntitlement(ctx.tenant.planCode, entitlement)) {
    throw new Error(`Plano sem permissão: ${entitlement}`);
  }
}
