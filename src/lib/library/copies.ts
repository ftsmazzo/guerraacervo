import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { books, copies } from "@/db/schema";

function makeBarcode() {
  return `E${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function insertCopy(
  tenantId: string,
  bookId: string,
  location: string | null,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const [row] = await db
        .insert(copies)
        .values({
          tenantId,
          bookId,
          barcode: makeBarcode(),
          status: "available",
          location,
        })
        .returning({ id: copies.id });
      return row.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg) || attempt === 5) throw e;
    }
  }
  throw new Error("Não foi possível gerar código do exemplar.");
}

/** Cria ou remove exemplares disponíveis para bater com a quantidade do título. */
export async function syncCopiesForBook(opts: {
  tenantId: string;
  bookId: string;
  desiredCount: number;
  location?: string | null;
}) {
  const desired = Math.max(0, Math.min(500, Math.floor(opts.desiredCount)));
  const existing = await db
    .select({
      id: copies.id,
      status: copies.status,
    })
    .from(copies)
    .where(
      and(eq(copies.tenantId, opts.tenantId), eq(copies.bookId, opts.bookId)),
    );

  const location = opts.location?.trim() || null;
  if (location) {
    await db
      .update(copies)
      .set({ location, updatedAt: new Date() })
      .where(
        and(eq(copies.tenantId, opts.tenantId), eq(copies.bookId, opts.bookId)),
      );
  }

  if (existing.length < desired) {
    const missing = desired - existing.length;
    for (let i = 0; i < missing; i += 1) {
      await insertCopy(opts.tenantId, opts.bookId, location);
    }
  } else if (existing.length > desired) {
    const extras = existing.filter((c) => c.status === "available");
    const toRemove = extras.slice(0, existing.length - desired);
    if (toRemove.length) {
      await db.delete(copies).where(
        and(
          eq(copies.tenantId, opts.tenantId),
          inArray(
            copies.id,
            toRemove.map((c) => c.id),
          ),
        ),
      );
    }
  }

  const [total] = await db
    .select({ n: count() })
    .from(copies)
    .where(
      and(eq(copies.tenantId, opts.tenantId), eq(copies.bookId, opts.bookId)),
    );

  await db
    .update(books)
    .set({ stock: Number(total?.n ?? desired), updatedAt: new Date() })
    .where(and(eq(books.id, opts.bookId), eq(books.tenantId, opts.tenantId)));
}

export async function countCopiesByBookIds(
  tenantId: string,
  bookIds: string[],
): Promise<Map<string, { total: number; available: number }>> {
  const map = new Map<string, { total: number; available: number }>();
  if (!bookIds.length) return map;
  const rows = await db
    .select({
      bookId: copies.bookId,
      status: copies.status,
      n: count(),
    })
    .from(copies)
    .where(and(eq(copies.tenantId, tenantId), inArray(copies.bookId, bookIds)))
    .groupBy(copies.bookId, copies.status);

  for (const row of rows) {
    const cur = map.get(row.bookId) || { total: 0, available: 0 };
    cur.total += Number(row.n);
    if (row.status === "available") cur.available += Number(row.n);
    map.set(row.bookId, cur);
  }
  return map;
}

export async function countOpenLoansOnBook(
  tenantId: string,
  bookId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(copies)
    .where(
      and(
        eq(copies.tenantId, tenantId),
        eq(copies.bookId, bookId),
        eq(copies.status, "on_loan"),
      ),
    );
  return Number(row?.n ?? 0);
}
