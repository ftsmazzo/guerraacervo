import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { books } from "@/db/schema";
import { getPlan, planHas, type Entitlement } from "@/lib/plans";

export async function countTenantBooks(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(books)
    .where(eq(books.tenantId, tenantId));
  return Number(row?.value ?? 0);
}

export async function canAddBook(
  tenantId: string,
  planCode: string,
): Promise<{ ok: boolean; current: number; max: number | null }> {
  const plan = getPlan(planCode);
  const current = await countTenantBooks(tenantId);
  const max = plan?.maxBooks ?? null;
  if (max === null) return { ok: true, current, max };
  return { ok: current < max, current, max };
}

export function assertEntitlement(
  planCode: string,
  entitlement: Entitlement,
): { ok: true } | { ok: false; error: string } {
  if (!planHas(planCode, entitlement)) {
    return {
      ok: false,
      error: `Plano sem permissão para: ${entitlement}`,
    };
  }
  return { ok: true };
}

/** Use em mutações de API antes de inserir livro */
export async function assertCanAddBook(tenantId: string, planCode: string) {
  const limit = await canAddBook(tenantId, planCode);
  if (!limit.ok) {
    return {
      ok: false as const,
      error: `Limite de livros atingido (${limit.current}/${limit.max}).`,
      current: limit.current,
      max: limit.max,
    };
  }
  return {
    ok: true as const,
    current: limit.current,
    max: limit.max,
  };
}
