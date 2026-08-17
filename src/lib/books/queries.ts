import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { bookTags, books, orderItems, orders, tags } from "@/db/schema";
import type { ReadingStatus } from "@/lib/reading/types";

export type ListBooksFilters = {
  busca?: string;
  estado?: string;
  /** "1" = disponível > 0; "0" = reservado sem disponível; "esgotado" = estoque 0 */
  disponivel?: string;
  /** Tags com lógica AND — livro deve ter todas */
  tags?: string[];
  readingStatus?: ReadingStatus;
  /** Aceita chaves EN (UI) e PT (legado) */
  order?:
    | "titulo"
    | "autor"
    | "preco_venda"
    | "estoque"
    | "created_at"
    | "title"
    | "author"
    | "salePrice"
    | "stock"
    | "createdAt";
  dir?: "asc" | "desc";
};

export type BookListItem = {
  id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  publisher: string | null;
  year: number | null;
  pages: number | null;
  coverUrl: string | null;
  genre: string | null;
  condition: string;
  coverType: string;
  salePrice: string;
  stock: number;
  location: string | null;
  createdAt: Date;
  readingStatus: ReadingStatus;
  currentPage: number;
  reserved: number;
  available: number;
  tagsList: string[];
};

function resolveOrderColumn(orderKey: ListBooksFilters["order"]) {
  switch (orderKey) {
    case "titulo":
    case "title":
      return books.title;
    case "autor":
    case "author":
      return books.author;
    case "preco_venda":
    case "salePrice":
      return books.salePrice;
    case "estoque":
    case "stock":
      return books.stock;
    case "created_at":
    case "createdAt":
    default:
      return books.createdAt;
  }
}

async function reservedByBookIds(
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
        inArray(orderItems.bookId, bookIds),
        eq(orders.status, "Aguardando Pagamento"),
      ),
    )
    .groupBy(orderItems.bookId);

  for (const r of rows) {
    map.set(r.bookId, Number(r.qty ?? 0));
  }
  return map;
}

async function tagsByBookIds(
  bookIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!bookIds.length) return map;

  const rows = await db
    .select({
      bookId: bookTags.bookId,
      name: tags.name,
    })
    .from(bookTags)
    .innerJoin(tags, eq(tags.id, bookTags.tagId))
    .where(inArray(bookTags.bookId, bookIds))
    .orderBy(asc(tags.name));

  for (const r of rows) {
    const list = map.get(r.bookId) || [];
    list.push(r.name);
    map.set(r.bookId, list);
  }
  return map;
}

export async function listBooks(
  tenantId: string,
  filters: ListBooksFilters = {},
): Promise<BookListItem[]> {
  const conditions: SQL[] = [eq(books.tenantId, tenantId)];

  const busca = filters.busca?.trim();
  if (busca) {
    const like = `%${busca}%`;
    conditions.push(
      or(
        ilike(books.title, like),
        ilike(books.author, like),
        ilike(books.isbn, like),
        ilike(books.publisher, like),
      )!,
    );
  }

  if (filters.estado) {
    conditions.push(
      eq(
        books.condition,
        filters.estado as "Novo" | "Ótimo" | "Bom" | "Regular",
      ),
    );
  }

  if (filters.readingStatus) {
    conditions.push(eq(books.readingStatus, filters.readingStatus));
  }

  const activeTags = (filters.tags || [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (activeTags.length > 0) {
    const n = activeTags.length;
    conditions.push(
      sql`${books.id} IN (
        SELECT ${bookTags.bookId}
        FROM ${bookTags}
        INNER JOIN ${tags} ON ${tags.id} = ${bookTags.tagId}
        WHERE ${tags.tenantId} = ${tenantId}
          AND ${tags.name} IN (${sql.join(
            activeTags.map((t) => sql`${t}`),
            sql`, `,
          )})
        GROUP BY ${bookTags.bookId}
        HAVING COUNT(DISTINCT ${tags.name}) = ${n}
      )`,
    );
  }

  const orderCol = resolveOrderColumn(filters.order);
  const dirFn = filters.dir === "asc" ? asc : desc;

  const rows = await db
    .select({
      id: books.id,
      isbn: books.isbn,
      title: books.title,
      author: books.author,
      publisher: books.publisher,
      year: books.year,
      pages: books.pages,
      coverUrl: books.coverUrl,
      genre: books.genre,
      condition: books.condition,
      coverType: books.coverType,
      salePrice: books.salePrice,
      stock: books.stock,
      location: books.location,
      createdAt: books.createdAt,
      readingStatus: books.readingStatus,
      currentPage: books.currentPage,
    })
    .from(books)
    .where(and(...conditions))
    .orderBy(dirFn(orderCol));

  const ids = rows.map((r) => r.id);
  const [reservedMap, tagsMap] = await Promise.all([
    reservedByBookIds(ids),
    tagsByBookIds(ids),
  ]);

  let items: BookListItem[] = rows.map((r) => {
    const reserved = reservedMap.get(r.id) ?? 0;
    return {
      id: r.id,
      isbn: r.isbn,
      title: r.title,
      author: r.author,
      publisher: r.publisher,
      year: r.year,
      pages: r.pages,
      coverUrl: r.coverUrl,
      genre: r.genre,
      condition: r.condition,
      coverType: r.coverType,
      salePrice: r.salePrice,
      stock: r.stock,
      location: r.location,
      createdAt: r.createdAt,
      readingStatus: r.readingStatus,
      currentPage: r.currentPage,
      reserved,
      available: r.stock - reserved,
      tagsList: tagsMap.get(r.id) ?? [],
    };
  });

  const disp = filters.disponivel;
  if (disp === "1") {
    items = items.filter((i) => i.available > 0);
  } else if (disp === "0") {
    items = items.filter((i) => i.available === 0 && i.reserved > 0);
  } else if (disp === "esgotado") {
    items = items.filter((i) => i.stock === 0);
  }

  return items;
}

export async function getBook(tenantId: string, id: string) {
  const [row] = await db
    .select({
      id: books.id,
      isbn: books.isbn,
      title: books.title,
      author: books.author,
      publisher: books.publisher,
      year: books.year,
      synopsis: books.synopsis,
      pages: books.pages,
      coverUrl: books.coverUrl,
      genre: books.genre,
      language: books.language,
      weightGrams: books.weightGrams,
      condition: books.condition,
      coverType: books.coverType,
      purchasePrice: books.purchasePrice,
      salePrice: books.salePrice,
      stock: books.stock,
      location: books.location,
      readingStatus: books.readingStatus,
      currentPage: books.currentPage,
      startedAt: books.startedAt,
      finishedAt: books.finishedAt,
      createdAt: books.createdAt,
      updatedAt: books.updatedAt,
    })
    .from(books)
    .where(and(eq(books.tenantId, tenantId), eq(books.id, id)))
    .limit(1);

  if (!row) return null;

  const bookTagRows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(tags.id, bookTags.tagId))
    .where(eq(bookTags.bookId, id))
    .orderBy(asc(tags.name));

  const reservedMap = await reservedByBookIds([id]);
  const reserved = reservedMap.get(id) ?? 0;

  return {
    ...row,
    reserved,
    available: row.stock - reserved,
    tagsList: bookTagRows.map((t) => t.name),
  };
}

export type TagCloudItem = { name: string; qtd: number };

export type ListTagCloudOpts = {
  /** Tags já ativas (AND) — contagens das demais tags só entre esses livros */
  activeTags?: string[];
  limit?: number;
};

export async function listTagCloud(
  tenantId: string,
  opts: ListTagCloudOpts | number = {},
): Promise<TagCloudItem[]> {
  const options: ListTagCloudOpts =
    typeof opts === "number" ? { limit: opts } : opts;
  const limit = options.limit ?? 100;
  const activeTags = (options.activeTags || [])
    .map((t) => t.trim())
    .filter(Boolean);

  let bookScope: string[] | null = null;
  if (activeTags.length) {
    const n = activeTags.length;
    const filtered = await db
      .select({
        bookId: bookTags.bookId,
      })
      .from(bookTags)
      .innerJoin(tags, eq(tags.id, bookTags.tagId))
      .where(
        and(
          eq(tags.tenantId, tenantId),
          inArray(tags.name, activeTags),
        ),
      )
      .groupBy(bookTags.bookId)
      .having(sql`COUNT(DISTINCT ${tags.name}) = ${n}`);
    bookScope = filtered.map((r) => r.bookId);
    if (!bookScope.length) return [];
  }

  const qtdExpr = sql<number>`count(DISTINCT ${bookTags.bookId})::int`;
  const conditions: SQL[] = [
    eq(tags.tenantId, tenantId),
    eq(books.tenantId, tenantId),
  ];
  if (bookScope) {
    conditions.push(inArray(bookTags.bookId, bookScope));
  }

  const rows = await db
    .select({
      name: tags.name,
      qtd: qtdExpr,
    })
    .from(tags)
    .innerJoin(bookTags, eq(bookTags.tagId, tags.id))
    .innerJoin(books, eq(books.id, bookTags.bookId))
    .where(and(...conditions))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(qtdExpr), asc(tags.name))
    .limit(limit);

  return rows.map((r) => ({ name: r.name, qtd: Number(r.qtd) }));
}
