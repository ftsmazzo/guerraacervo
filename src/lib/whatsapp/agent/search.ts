import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bookTags,
  books,
  clientInterestTags,
  orderItems,
  orders,
  tags,
} from "@/db/schema";
import {
  filterInterestTags,
  isGenericInterestTag,
} from "@/lib/whatsapp/interest-tags";

export type CatalogHit = {
  id: string;
  title: string;
  author: string | null;
  salePrice: string;
  condition: string;
  synopsis: string | null;
  stock: number;
  reserved: number;
  available: number;
  tags: string[];
  score: number;
};

async function reservedMap(
  tenantId: string,
  bookIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!bookIds.length) return map;
  const rows = await db
    .select({
      bookId: orderItems.bookId,
      qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        inArray(orderItems.bookId, bookIds),
        eq(orders.status, "Aguardando Pagamento"),
      ),
    )
    .groupBy(orderItems.bookId);
  for (const r of rows) map.set(r.bookId, Number(r.qty ?? 0));
  return map;
}

async function tagsForBooks(
  bookIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!bookIds.length) return map;
  const rows = await db
    .select({ bookId: bookTags.bookId, name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(tags.id, bookTags.tagId))
    .where(inArray(bookTags.bookId, bookIds));
  for (const r of rows) {
    const list = map.get(r.bookId) || [];
    list.push(r.name);
    map.set(r.bookId, list);
  }
  return map;
}

export async function getClientInterestTagNames(
  clientId: string,
): Promise<string[]> {
  const rows = await db
    .select({
      id: clientInterestTags.id,
      tag: clientInterestTags.tag,
      weight: clientInterestTags.weight,
    })
    .from(clientInterestTags)
    .where(eq(clientInterestTags.clientId, clientId));

  const genericIds = rows
    .filter((r) => isGenericInterestTag(r.tag))
    .map((r) => r.id);
  if (genericIds.length) {
    await db
      .delete(clientInterestTags)
      .where(inArray(clientInterestTags.id, genericIds));
  }

  return rows
    .filter((r) => !isGenericInterestTag(r.tag))
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.tag.toLowerCase());
}

function normText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens úteis p/ autor/tema (ex.: "c s lewis" → ["cs","lewis"]). */
export function queryTokens(q: string): string[] {
  const raw = normText(q).split(" ").filter(Boolean);
  const tokens: string[] = [];
  let initials = "";
  for (const t of raw) {
    if (t.length === 1) {
      initials += t;
      continue;
    }
    if (initials.length >= 2) tokens.push(initials);
    initials = "";
    if (t.length >= 2) tokens.push(t);
  }
  if (initials.length >= 2) tokens.push(initials);
  return tokens;
}

export function authorMatchesQuery(
  author: string | null | undefined,
  q: string,
): boolean {
  if (!author?.trim() || !q.trim()) return false;
  const a = normText(author);
  const tokens = queryTokens(q);
  if (!tokens.length) return false;
  // Todos os tokens no autor (CS Lewis ⊂ C S Lewis / C.S. Lewis)
  if (tokens.every((t) => a.includes(t))) return true;
  const compactA = a.replace(/\s+/g, "");
  const compactQ = tokens.join("");
  return compactA.includes(compactQ) || compactQ.includes(compactA);
}

export async function searchCatalogForAgent(opts: {
  tenantId: string;
  query?: string;
  interestTags?: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  limit?: number;
  /** Se true, só devolve hits com autor batendo no query (quando há autor). */
  authorOnly?: boolean;
}): Promise<CatalogHit[]> {
  const limit = opts.limit ?? 8;
  const conditions: SQL[] = [
    eq(books.tenantId, opts.tenantId),
    sql`${books.stock} > 0`,
  ];

  const q = opts.query?.trim();
  const tokens = q ? queryTokens(q) : [];
  let tagMatchedIds: string[] = [];
  if (q) {
    const like = `%${q}%`;
    const tagHits = await db
      .select({ bookId: bookTags.bookId })
      .from(bookTags)
      .innerJoin(tags, eq(tags.id, bookTags.tagId))
      .innerJoin(books, eq(books.id, bookTags.bookId))
      .where(
        and(
          eq(books.tenantId, opts.tenantId),
          sql`${books.stock} > 0`,
          ilike(tags.name, like),
        ),
      )
      .limit(40);
    tagMatchedIds = [...new Set(tagHits.map((t) => t.bookId))];

    const parts: SQL[] = [
      ilike(books.title, like),
      ilike(books.author, like),
      ilike(books.isbn, like),
      ilike(books.genre, like),
    ];
    // "CS Lewis" também casa "C. S. Lewis" / "Lewis, C.S." via tokens
    for (const tok of tokens.slice(0, 4)) {
      parts.push(ilike(books.author, `%${tok}%`));
      parts.push(ilike(books.title, `%${tok}%`));
    }
    if (tagMatchedIds.length) parts.push(inArray(books.id, tagMatchedIds));
    conditions.push(or(...parts)!);
  } else if (opts.interestTags?.length) {
    const interestLike = filterInterestTags(opts.interestTags).slice(0, 12);
    if (interestLike.length) {
      const interestHits = await db
        .select({ bookId: bookTags.bookId })
        .from(bookTags)
        .innerJoin(tags, eq(tags.id, bookTags.tagId))
        .innerJoin(books, eq(books.id, bookTags.bookId))
        .where(
          and(
            eq(books.tenantId, opts.tenantId),
            sql`${books.stock} > 0`,
            sql`lower(${tags.name}) in (${sql.join(
              interestLike.map((t) => sql`${t}`),
              sql`, `,
            )})`,
          ),
        )
        .limit(60);
      const ids = [...new Set(interestHits.map((t) => t.bookId))];
      if (ids.length) {
        conditions.push(inArray(books.id, ids));
      }
    }
  }

  if (opts.budgetMax != null && opts.budgetMax > 0) {
    conditions.push(sql`${books.salePrice}::numeric <= ${opts.budgetMax}`);
  }
  if (opts.budgetMin != null && opts.budgetMin > 0) {
    conditions.push(sql`${books.salePrice}::numeric >= ${opts.budgetMin}`);
  }

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      salePrice: books.salePrice,
      condition: books.condition,
      synopsis: books.synopsis,
      stock: books.stock,
      genre: books.genre,
    })
    .from(books)
    .where(and(...conditions))
    .orderBy(asc(books.title))
    .limit(40);

  const ids = rows.map((r) => r.id);
  const [reserved, tagMap] = await Promise.all([
    reservedMap(opts.tenantId, ids),
    tagsForBooks(ids),
  ]);

  const interest = new Set(filterInterestTags(opts.interestTags || []));

  const hits: CatalogHit[] = [];
  for (const r of rows) {
    const res = reserved.get(r.id) ?? 0;
    const available = r.stock - res;
    if (available <= 0) continue;
    const bookTagsList = (tagMap.get(r.id) || []).filter(
      (t) => !isGenericInterestTag(t),
    );
    if (r.genre && !isGenericInterestTag(r.genre)) {
      bookTagsList.push(r.genre.toLowerCase());
    }
    let score = 0;
    for (const t of bookTagsList) {
      if (interest.has(t.toLowerCase())) score += 3;
    }
    const isAuthorHit = q ? authorMatchesQuery(r.author, q) : false;
    if (q) {
      const ql = normText(q);
      const titleN = normText(r.title);
      if (titleN.includes(ql)) score += 8;
      if (isAuthorHit) score += 12;
      for (const tok of tokens) {
        if (titleN.includes(tok)) score += 2;
        if (normText(r.author || "").includes(tok)) score += 3;
      }
    }
    if (!q && interest.size === 0) score = 1;
    if (opts.authorOnly && q && !isAuthorHit) continue;
    hits.push({
      id: r.id,
      title: r.title,
      author: r.author,
      salePrice: r.salePrice,
      condition: r.condition,
      synopsis: r.synopsis,
      stock: r.stock,
      reserved: res,
      available,
      tags: bookTagsList,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}

export async function getBooksByIds(
  tenantId: string,
  bookIds: string[],
): Promise<CatalogHit[]> {
  if (!bookIds.length) return [];
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      salePrice: books.salePrice,
      condition: books.condition,
      synopsis: books.synopsis,
      stock: books.stock,
    })
    .from(books)
    .where(and(eq(books.tenantId, tenantId), inArray(books.id, bookIds)));

  const [reserved, tagMap] = await Promise.all([
    reservedMap(tenantId, bookIds),
    tagsForBooks(bookIds),
  ]);

  return bookIds
    .map((id) => rows.find((r) => r.id === id))
    .filter(Boolean)
    .map((r) => {
      const res = reserved.get(r!.id) ?? 0;
      return {
        id: r!.id,
        title: r!.title,
        author: r!.author,
        salePrice: r!.salePrice,
        condition: r!.condition,
        synopsis: r!.synopsis,
        stock: r!.stock,
        reserved: res,
        available: r!.stock - res,
        tags: tagMap.get(r!.id) || [],
        score: 0,
      };
    })
    .filter((h) => h.available > 0);
}
