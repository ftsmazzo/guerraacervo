import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { bookTags, books, orderItems, orders, tags } from "@/db/schema";

export type ListBooksFilters = {
  busca?: string;
  estado?: string;
  /** "1" = disponível > 0; "0" = reservado sem disponível; "esgotado" = estoque 0 */
  disponivel?: string;
  /** Tags com lógica AND — livro deve ter todas */
  tags?: string[];
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

const reservedExpr = sql<number>`(
  SELECT COALESCE(SUM(${orderItems.quantity}), 0)::int
  FROM ${orderItems}
  INNER JOIN ${orders} ON ${orders.id} = ${orderItems.orderId}
  WHERE ${orderItems.bookId} = ${books.id}
    AND ${orders.status} = 'Aguardando Pagamento'
)`.mapWith(Number);

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
  reserved: number;
  available: number;
  tagsList: string[];
};

function resolveOrderColumn(
  orderKey: ListBooksFilters["order"],
) {
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
      reserved: reservedExpr,
      tagsAgg: sql<string | null>`(
        SELECT string_agg(${tags.name}, ',' ORDER BY ${tags.name})
        FROM ${bookTags}
        INNER JOIN ${tags} ON ${tags.id} = ${bookTags.tagId}
        WHERE ${bookTags.bookId} = ${books.id}
      )`,
    })
    .from(books)
    .where(and(...conditions))
    .orderBy(dirFn(orderCol));

  let items: BookListItem[] = rows.map((r) => {
    const reserved = Number(r.reserved ?? 0);
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
      reserved,
      available: r.stock - reserved,
      tagsList: r.tagsAgg ? r.tagsAgg.split(",").filter(Boolean) : [],
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
      createdAt: books.createdAt,
      updatedAt: books.updatedAt,
      reserved: reservedExpr,
    })
    .from(books)
    .where(and(eq(books.id, id), eq(books.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  const bookTagRows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(tags.id, bookTags.tagId))
    .where(eq(bookTags.bookId, id))
    .orderBy(asc(tags.name));

  const reserved = Number(row.reserved ?? 0);
  return {
    ...row,
    reserved,
    available: row.stock - reserved,
    tags: bookTagRows.map((t) => t.name),
    tagsList: bookTagRows.map((t) => t.name),
  };
}

export type TagCloudItem = { name: string; qtd: number };

export async function listTagCloud(
  tenantId: string,
  limit = 100,
): Promise<TagCloudItem[]> {
  const rows = await db
    .select({
      name: tags.name,
      qtd: count(bookTags.bookId),
    })
    .from(tags)
    .innerJoin(bookTags, eq(bookTags.tagId, tags.id))
    .where(eq(tags.tenantId, tenantId))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(count(bookTags.bookId)), asc(tags.name))
    .limit(limit);

  return rows.map((r) => ({ name: r.name, qtd: Number(r.qtd) }));
}
