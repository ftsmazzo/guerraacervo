import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { books, clients, orderItems, orders } from "@/db/schema";
import {
  OPEN_ORDER_STATUSES,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/orders/constants";

export {
  DEBIT_STATUSES,
  OPEN_ORDER_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/orders/constants";

export type ListOrdersFilters = {
  status?: string;
  busca?: string;
  dataIni?: string;
  dataFim?: string;
};

export type OrderListItem = {
  id: string;
  orderDate: Date;
  paymentMethod: string;
  status: string;
  trackingCode: string | null;
  totalWeight: number | null;
  totalAmount: string | null;
  createdAt: Date;
  clientId: string;
  clientName: string;
  itemCount: number;
};

export type OrderItemDetail = {
  id: string;
  bookId: string;
  quantity: number;
  unitPrice: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  weightGrams: number | null;
  isbn: string | null;
  condition: string;
  coverType: string;
  location: string | null;
};

export type OrderDetail = {
  id: string;
  orderDate: Date;
  paymentMethod: string;
  status: string;
  trackingCode: string | null;
  totalWeight: number | null;
  totalAmount: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  clientId: string;
  clientName: string;
  clientWhatsapp: string | null;
  clientEmail: string | null;
  clientStreet: string | null;
  clientNumber: string | null;
  clientComplement: string | null;
  clientDistrict: string | null;
  clientCity: string | null;
  clientState: string | null;
  clientCep: string | null;
  items: OrderItemDetail[];
};

export type ClientOption = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

export type BookPickerItem = {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  salePrice: string;
  weightGrams: number | null;
  stock: number;
  reserved: number;
  available: number;
  condition: string;
  location: string | null;
};

export async function countOpenOrders(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        inArray(orders.status, OPEN_ORDER_STATUSES),
      ),
    );
  return row?.n ?? 0;
}

export async function orderStatusCounters(
  tenantId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: orders.status,
      n: count(),
    })
    .from(orders)
    .where(eq(orders.tenantId, tenantId))
    .groupBy(orders.status);

  const map: Record<string, number> = {};
  for (const s of ORDER_STATUSES) map[s] = 0;
  let total = 0;
  for (const r of rows) {
    map[r.status] = r.n;
    total += r.n;
  }
  map.__total = total;
  return map;
}

export async function listOrders(
  tenantId: string,
  filters: ListOrdersFilters = {},
): Promise<OrderListItem[]> {
  const conditions: SQL[] = [eq(orders.tenantId, tenantId)];

  if (filters.status && ORDER_STATUSES.includes(filters.status as OrderStatus)) {
    conditions.push(eq(orders.status, filters.status as OrderStatus));
  }

  const q = filters.busca?.trim();
  if (q) {
    conditions.push(
      or(ilike(clients.name, `%${q}%`), sql`${orders.id}::text ilike ${`%${q}%`}`)!,
    );
  }

  if (filters.dataIni) {
    conditions.push(gte(orders.orderDate, new Date(`${filters.dataIni}T00:00:00`)));
  }
  if (filters.dataFim) {
    conditions.push(lte(orders.orderDate, new Date(`${filters.dataFim}T23:59:59.999`)));
  }

  const rows = await db
    .select({
      id: orders.id,
      orderDate: orders.orderDate,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      trackingCode: orders.trackingCode,
      totalWeight: orders.totalWeight,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt,
      clientId: orders.clientId,
      clientName: clients.name,
      itemCount: sql<number>`coalesce(count(${orderItems.id}), 0)`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(...conditions))
    .groupBy(orders.id, clients.name)
    .orderBy(desc(orders.createdAt));

  return rows;
}

export async function listOrdersByClient(
  tenantId: string,
  clientId: string,
): Promise<OrderListItem[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderDate: orders.orderDate,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      trackingCode: orders.trackingCode,
      totalWeight: orders.totalWeight,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt,
      clientId: orders.clientId,
      clientName: clients.name,
      itemCount: sql<number>`coalesce(count(${orderItems.id}), 0)`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.clientId, clientId),
      ),
    )
    .groupBy(orders.id, clients.name)
    .orderBy(desc(orders.createdAt));

  return rows;
}

export async function getOrder(
  tenantId: string,
  id: string,
): Promise<OrderDetail | null> {
  const [row] = await db
    .select({
      id: orders.id,
      orderDate: orders.orderDate,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      trackingCode: orders.trackingCode,
      totalWeight: orders.totalWeight,
      totalAmount: orders.totalAmount,
      notes: orders.notes,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      clientId: orders.clientId,
      clientName: clients.name,
      clientWhatsapp: clients.whatsapp,
      clientEmail: clients.email,
      clientStreet: clients.street,
      clientNumber: clients.number,
      clientComplement: clients.complement,
      clientDistrict: clients.district,
      clientCity: clients.city,
      clientState: clients.state,
      clientCep: clients.cep,
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select({
      id: orderItems.id,
      bookId: orderItems.bookId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      weightGrams: books.weightGrams,
      isbn: books.isbn,
      condition: books.condition,
      coverType: books.coverType,
      location: books.location,
    })
    .from(orderItems)
    .innerJoin(books, eq(books.id, orderItems.bookId))
    .where(eq(orderItems.orderId, id));

  return { ...row, items };
}

export async function listClientsForOrder(
  tenantId: string,
): Promise<ClientOption[]> {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      city: clients.city,
      state: clients.state,
    })
    .from(clients)
    .where(eq(clients.tenantId, tenantId))
    .orderBy(asc(clients.name));
}

async function reservedMapForBooks(
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

export async function searchBooksForOrder(
  tenantId: string,
  busca: string,
  limit = 20,
): Promise<BookPickerItem[]> {
  const q = busca.trim();
  const conditions: SQL[] = [
    eq(books.tenantId, tenantId),
    sql`${books.stock} > 0`,
    isNull(books.archivedAt),
  ];
  if (q) {
    conditions.push(
      or(
        ilike(books.title, `%${q}%`),
        ilike(books.author, `%${q}%`),
        ilike(books.isbn, `%${q}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      salePrice: books.salePrice,
      weightGrams: books.weightGrams,
      stock: books.stock,
      condition: books.condition,
      location: books.location,
    })
    .from(books)
    .where(and(...conditions))
    .orderBy(asc(books.title))
    .limit(limit);

  const reserved = await reservedMapForBooks(
    tenantId,
    rows.map((r) => r.id),
  );

  return rows
    .map((r) => {
      const res = reserved.get(r.id) ?? 0;
      return {
        ...r,
        reserved: res,
        available: r.stock - res,
      };
    })
    .filter((r) => r.available > 0);
}
