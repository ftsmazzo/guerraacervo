import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { books, clients, copies, loans, tenants } from "@/db/schema";
import { getLibraryPolicy } from "@/lib/library/policy";

export type CirculationLoan = {
  id: string;
  copyId: string;
  bookId: string;
  clientId: string;
  barcode: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  readerName: string;
  readerWhatsapp: string | null;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  renewedCount: number;
  status: "open" | "overdue" | "returned";
};

export type CopySearchHit = {
  copyId: string;
  bookId: string;
  barcode: string;
  status: "available" | "on_loan" | "lost" | "repair";
  location: string | null;
  title: string;
  author: string | null;
  coverUrl: string | null;
  availableCount: number;
};

export type ReaderSearchHit = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  openLoans: number;
};

function effectiveStatus(
  status: "open" | "overdue" | "returned",
  dueAt: Date,
  returnedAt: Date | null,
): "open" | "overdue" | "returned" {
  if (returnedAt || status === "returned") return "returned";
  if (dueAt.getTime() < Date.now()) return "overdue";
  return "open";
}

export async function getTenantLibraryPolicy(tenantId: string) {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return getLibraryPolicy(row?.settings);
}

export async function listOpenLoans(
  tenantId: string,
): Promise<CirculationLoan[]> {
  const rows = await db
    .select({
      id: loans.id,
      copyId: loans.copyId,
      bookId: loans.bookId,
      clientId: loans.clientId,
      barcode: copies.barcode,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      readerName: clients.name,
      readerWhatsapp: clients.whatsapp,
      borrowedAt: loans.borrowedAt,
      dueAt: loans.dueAt,
      returnedAt: loans.returnedAt,
      renewedCount: loans.renewedCount,
      status: loans.status,
    })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(clients, eq(clients.id, loans.clientId))
    .where(
      and(
        eq(loans.tenantId, tenantId),
        inArray(loans.status, ["open", "overdue"]),
      ),
    )
    .orderBy(asc(loans.dueAt));

  return rows.map((r) => ({
    ...r,
    status: effectiveStatus(r.status, r.dueAt, r.returnedAt),
  }));
}

export async function listLoansForClient(
  tenantId: string,
  clientId: string,
  opts: { openOnly?: boolean } = {},
): Promise<CirculationLoan[]> {
  const conditions: SQL[] = [
    eq(loans.tenantId, tenantId),
    eq(loans.clientId, clientId),
  ];
  if (opts.openOnly) {
    conditions.push(inArray(loans.status, ["open", "overdue"]));
  }
  const rows = await db
    .select({
      id: loans.id,
      copyId: loans.copyId,
      bookId: loans.bookId,
      clientId: loans.clientId,
      barcode: copies.barcode,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      readerName: clients.name,
      readerWhatsapp: clients.whatsapp,
      borrowedAt: loans.borrowedAt,
      dueAt: loans.dueAt,
      returnedAt: loans.returnedAt,
      renewedCount: loans.renewedCount,
      status: loans.status,
    })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(clients, eq(clients.id, loans.clientId))
    .where(and(...conditions))
    .orderBy(desc(loans.borrowedAt))
    .limit(40);

  return rows.map((r) => ({
    ...r,
    status: effectiveStatus(r.status, r.dueAt, r.returnedAt),
  }));
}

export async function countLibraryDashboard(tenantId: string) {
  const [openRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(
      and(
        eq(loans.tenantId, tenantId),
        inArray(loans.status, ["open", "overdue"]),
      ),
    );
  const [overdueRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(
      and(
        eq(loans.tenantId, tenantId),
        inArray(loans.status, ["open", "overdue"]),
        sql`${loans.dueAt} < now()`,
      ),
    );
  const [availableRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(copies)
    .where(
      and(eq(copies.tenantId, tenantId), eq(copies.status, "available")),
    );
  return {
    openLoans: Number(openRow?.n ?? 0),
    overdue: Number(overdueRow?.n ?? 0),
    availableCopies: Number(availableRow?.n ?? 0),
  };
}

export async function searchReaders(
  tenantId: string,
  q: string,
): Promise<ReaderSearchHit[]> {
  const term = q.trim();
  const conditions: SQL[] = [eq(clients.tenantId, tenantId)];
  if (term) {
    const like = `%${term}%`;
    conditions.push(
      or(
        ilike(clients.name, like),
        ilike(clients.whatsapp, like),
        ilike(clients.email, like),
      )!,
    );
  }

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      whatsapp: clients.whatsapp,
      email: clients.email,
      openLoans: sql<number>`coalesce((
        select count(*)::int from loans
        where loans.client_id = ${clients.id}
          and loans.tenant_id = ${tenantId}
          and loans.status in ('open', 'overdue')
      ), 0)`,
    })
    .from(clients)
    .where(and(...conditions))
    .orderBy(asc(clients.name))
    .limit(12);

  return rows.map((r) => ({
    ...r,
    openLoans: Number(r.openLoans),
  }));
}

export async function searchCopiesOrTitles(
  tenantId: string,
  q: string,
): Promise<CopySearchHit[]> {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term}%`;

  const copyHits = await db
    .select({
      copyId: copies.id,
      bookId: copies.bookId,
      barcode: copies.barcode,
      status: copies.status,
      location: copies.location,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
    })
    .from(copies)
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(
      and(
        eq(copies.tenantId, tenantId),
        or(ilike(copies.barcode, like), eq(copies.barcode, term.toUpperCase()))!,
      ),
    )
    .limit(8);

  const bookHits = await db
    .select({
      bookId: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      location: books.location,
    })
    .from(books)
    .where(
      and(
        eq(books.tenantId, tenantId),
        or(
          ilike(books.title, like),
          ilike(books.author, like),
          ilike(books.isbn, like),
        )!,
      ),
    )
    .orderBy(asc(books.title))
    .limit(8);

  const bookIds = [
    ...new Set([
      ...copyHits.map((c) => c.bookId),
      ...bookHits.map((b) => b.bookId),
    ]),
  ];
  const availRows = bookIds.length
    ? await db
        .select({
          bookId: copies.bookId,
          n: sql<number>`count(*)::int`,
        })
        .from(copies)
        .where(
          and(
            eq(copies.tenantId, tenantId),
            inArray(copies.bookId, bookIds),
            eq(copies.status, "available"),
          ),
        )
        .groupBy(copies.bookId)
    : [];
  const availMap = new Map(availRows.map((r) => [r.bookId, Number(r.n)]));

  const availableCopies = await db
    .select({
      copyId: copies.id,
      bookId: copies.bookId,
      barcode: copies.barcode,
      status: copies.status,
      location: copies.location,
    })
    .from(copies)
    .where(
      and(
        eq(copies.tenantId, tenantId),
        inArray(
          copies.bookId,
          bookHits.map((b) => b.bookId).concat(copyHits.map((c) => c.bookId)),
        ),
        eq(copies.status, "available"),
      ),
    );

  const firstAvailable = new Map<string, (typeof availableCopies)[number]>();
  for (const row of availableCopies) {
    if (!firstAvailable.has(row.bookId)) firstAvailable.set(row.bookId, row);
  }

  const seen = new Set<string>();
  const out: CopySearchHit[] = [];

  for (const hit of copyHits) {
    seen.add(hit.copyId);
    out.push({
      ...hit,
      availableCount: availMap.get(hit.bookId) ?? 0,
    });
  }

  for (const book of bookHits) {
    const copy = firstAvailable.get(book.bookId);
    if (!copy || seen.has(copy.copyId)) {
      if (!copy) {
        out.push({
          copyId: "",
          bookId: book.bookId,
          barcode: "",
          status: "on_loan",
          location: book.location,
          title: book.title,
          author: book.author,
          coverUrl: book.coverUrl,
          availableCount: 0,
        });
      }
      continue;
    }
    seen.add(copy.copyId);
    out.push({
      copyId: copy.copyId,
      bookId: book.bookId,
      barcode: copy.barcode,
      status: copy.status,
      location: copy.location ?? book.location,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      availableCount: availMap.get(book.bookId) ?? 0,
    });
  }

  return out.slice(0, 12);
}

export async function listPublicCatalog(opts: {
  tenantId: string;
  busca?: string;
  limit?: number;
}) {
  const conditions: SQL[] = [eq(books.tenantId, opts.tenantId)];
  const busca = opts.busca?.trim();
  if (busca) {
    const like = `%${busca}%`;
    conditions.push(
      sql`(${books.title} ilike ${like} or ${books.author} ilike ${like} or coalesce(${books.isbn}, '') ilike ${like})`,
    );
  }

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      condition: books.condition,
      available: sql<number>`coalesce((
        select count(*)::int from copies
        where copies.book_id = ${books.id}
          and copies.status = 'available'
      ), 0)`,
    })
    .from(books)
    .where(and(...conditions))
    .orderBy(asc(books.title))
    .limit(opts.limit ?? 48);

  return rows;
}

export type CirculationReport = {
  loansInPeriod: number;
  returnedInPeriod: number;
  overdueNow: number;
  availableCopies: number;
  recent: CirculationLoan[];
};

export async function getCirculationReport(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<CirculationReport> {
  const [made] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(
      and(
        eq(loans.tenantId, tenantId),
        sql`${loans.borrowedAt} >= ${from}`,
        sql`${loans.borrowedAt} <= ${to}`,
      ),
    );
  const [returned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(
      and(
        eq(loans.tenantId, tenantId),
        sql`${loans.returnedAt} >= ${from}`,
        sql`${loans.returnedAt} <= ${to}`,
      ),
    );
  const dash = await countLibraryDashboard(tenantId);
  const recentRows = await db
    .select({
      id: loans.id,
      copyId: loans.copyId,
      bookId: loans.bookId,
      clientId: loans.clientId,
      barcode: copies.barcode,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      readerName: clients.name,
      readerWhatsapp: clients.whatsapp,
      borrowedAt: loans.borrowedAt,
      dueAt: loans.dueAt,
      returnedAt: loans.returnedAt,
      renewedCount: loans.renewedCount,
      status: loans.status,
    })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(clients, eq(clients.id, loans.clientId))
    .where(
      and(
        eq(loans.tenantId, tenantId),
        sql`${loans.borrowedAt} >= ${from}`,
        sql`${loans.borrowedAt} <= ${to}`,
      ),
    )
    .orderBy(desc(loans.borrowedAt))
    .limit(80);

  return {
    loansInPeriod: Number(made?.n ?? 0),
    returnedInPeriod: Number(returned?.n ?? 0),
    overdueNow: dash.overdue,
    availableCopies: dash.availableCopies,
    recent: recentRows.map((r) => ({
      ...r,
      status: effectiveStatus(r.status, r.dueAt, r.returnedAt),
    })),
  };
}
