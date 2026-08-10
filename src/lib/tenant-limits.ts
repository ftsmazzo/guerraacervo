import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { books } from "@/db/schema";
import { getPlan } from "@/lib/plans";

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
