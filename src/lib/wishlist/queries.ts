import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { wishItems } from "@/db/schema";

export async function countWishItems(tenantId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(wishItems)
    .where(eq(wishItems.tenantId, tenantId));
  return Number(row?.value ?? 0);
}

export async function listWishItems(tenantId: string) {
  return db
    .select()
    .from(wishItems)
    .where(eq(wishItems.tenantId, tenantId))
    .orderBy(desc(wishItems.createdAt));
}

export async function getWishItem(tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(wishItems)
    .where(and(eq(wishItems.id, id), eq(wishItems.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}
