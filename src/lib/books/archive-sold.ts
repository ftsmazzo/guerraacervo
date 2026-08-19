import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { books, orderItems, orders, tenants } from "@/db/schema";
import { DEBIT_STATUSES } from "@/lib/orders/constants";

export const ARCHIVE_AFTER_DAYS = 5;

/** Esgotados há 5 dias, sem reserva aberta: saem da cota e da lista. */
export async function runArchiveSoldBooks() {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const pending = db
    .selectDistinct({ bookId: orderItems.bookId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.status, "Aguardando Pagamento"))
    .as("pending_books");

  const lastDebit = db
    .select({
      bookId: orderItems.bookId,
      lastAt: sql<Date>`max(${orders.updatedAt})`.as("last_at"),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(inArray(orders.status, DEBIT_STATUSES))
    .groupBy(orderItems.bookId)
    .as("last_debit");

  const eligible = await db
    .select({ id: books.id })
    .from(books)
    .innerJoin(tenants, eq(tenants.id, books.tenantId))
    .leftJoin(pending, eq(pending.bookId, books.id))
    .leftJoin(lastDebit, eq(lastDebit.bookId, books.id))
    .where(
      and(
        eq(tenants.product, "business"),
        eq(books.stock, 0),
        isNull(books.archivedAt),
        isNull(pending.bookId),
        lte(sql`coalesce(${lastDebit.lastAt}, ${books.updatedAt})`, cutoff),
      ),
    );

  const ids = eligible.map((r) => r.id);
  if (!ids.length) return { archived: 0 };

  const now = new Date();
  await db
    .update(books)
    .set({ archivedAt: now, updatedAt: now })
    .where(inArray(books.id, ids));

  return { archived: ids.length };
}
