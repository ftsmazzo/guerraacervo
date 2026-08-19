import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { books, clients, orderItems, orders } from "@/db/schema";
import { DEBIT_STATUSES, ORDER_STATUSES } from "@/lib/orders/constants";
import { endOfDay, startOfDay } from "@/lib/reports/period";

export type ReportKpis = {
  receita: number;
  pedidosPagos: number;
  livrosVendidos: number;
  ticketMedio: number;
  aguardandoPagamento: number;
  valorReservado: number;
  titulosCatalogo: number;
  unidadesEstoque: number;
  unidadesDisponiveis: number;
  unidadesReservadas: number;
  semEstoque: number;
};

export type SalesRow = {
  id: string;
  orderDate: Date;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  clientName: string;
  bookQty: number;
  itemLines: number;
};

export type PaymentBreakdown = {
  paymentMethod: string;
  count: number;
  total: number;
};

export type StatusBreakdown = {
  status: string;
  count: number;
  total: number;
};

export type TopBookRow = {
  bookId: string;
  title: string;
  author: string | null;
  qty: number;
  revenue: number;
};

export type DailyRevenue = {
  day: string;
  total: number;
  orders: number;
};

export type StockRow = {
  id: string;
  title: string;
  author: string | null;
  stock: number;
  reserved: number;
  available: number;
  salePrice: number;
  location: string | null;
};

function periodFilter(tenantId: string, dataIni: string, dataFim: string) {
  return and(
    eq(orders.tenantId, tenantId),
    gte(orders.orderDate, startOfDay(dataIni)),
    lte(orders.orderDate, endOfDay(dataFim)),
  );
}

export async function getReportKpis(
  tenantId: string,
  dataIni: string,
  dataFim: string,
): Promise<ReportKpis> {
  const period = periodFilter(tenantId, dataIni, dataFim);

  const [sales] = await db
    .select({
      receita: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      pedidos: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(and(period, inArray(orders.status, [...DEBIT_STATUSES])));

  const [booksSold] = await db
    .select({
      qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(period, inArray(orders.status, [...DEBIT_STATUSES])));

  const [awaiting] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      valor: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(and(period, eq(orders.status, "Aguardando Pagamento")));

  const reservedByBook = db
    .select({
      bookId: orderItems.bookId,
      reserved: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`.as(
        "reserved",
      ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, "Aguardando Pagamento"),
      ),
    )
    .groupBy(orderItems.bookId)
    .as("rb");

  const [stock] = await db
    .select({
      titulos: sql<number>`COUNT(*)::int`,
      unidades: sql<number>`COALESCE(SUM(${books.stock}), 0)::int`,
      disponiveis: sql<number>`COALESCE(SUM(GREATEST(${books.stock} - COALESCE(${reservedByBook.reserved}, 0), 0)), 0)::int`,
      reservadas: sql<number>`COALESCE(SUM(COALESCE(${reservedByBook.reserved}, 0)), 0)::int`,
      semEstoque: sql<number>`COUNT(*) FILTER (WHERE ${books.stock} <= 0)::int`,
    })
    .from(books)
    .leftJoin(reservedByBook, eq(reservedByBook.bookId, books.id))
    .where(and(eq(books.tenantId, tenantId), isNull(books.archivedAt)));

  const receita = Number(sales?.receita ?? 0);
  const pedidosPagos = Number(sales?.pedidos ?? 0);

  return {
    receita,
    pedidosPagos,
    livrosVendidos: Number(booksSold?.qty ?? 0),
    ticketMedio: pedidosPagos > 0 ? receita / pedidosPagos : 0,
    aguardandoPagamento: Number(awaiting?.n ?? 0),
    valorReservado: Number(awaiting?.valor ?? 0),
    titulosCatalogo: Number(stock?.titulos ?? 0),
    unidadesEstoque: Number(stock?.unidades ?? 0),
    unidadesDisponiveis: Number(stock?.disponiveis ?? 0),
    unidadesReservadas: Number(stock?.reservadas ?? 0),
    semEstoque: Number(stock?.semEstoque ?? 0),
  };
}

export async function listSalesReport(
  tenantId: string,
  dataIni: string,
  dataFim: string,
  opts?: { status?: string; paymentMethod?: string },
): Promise<SalesRow[]> {
  const conds = [periodFilter(tenantId, dataIni, dataFim)!];

  if (opts?.status && ORDER_STATUSES.includes(opts.status as never)) {
    conds.push(eq(orders.status, opts.status as never));
  } else {
    conds.push(inArray(orders.status, [...DEBIT_STATUSES]));
  }
  if (opts?.paymentMethod) {
    conds.push(eq(orders.paymentMethod, opts.paymentMethod as never));
  }

  const rows = await db
    .select({
      id: orders.id,
      orderDate: orders.orderDate,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      totalAmount: orders.totalAmount,
      clientName: clients.name,
      bookQty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      itemLines: sql<number>`COUNT(${orderItems.id})::int`,
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(...conds))
    .groupBy(
      orders.id,
      orders.orderDate,
      orders.status,
      orders.paymentMethod,
      orders.totalAmount,
      clients.name,
    )
    .orderBy(desc(orders.orderDate));

  return rows.map((r) => ({
    id: r.id,
    orderDate: r.orderDate,
    status: r.status,
    paymentMethod: r.paymentMethod,
    totalAmount: Number(r.totalAmount ?? 0),
    clientName: r.clientName,
    bookQty: Number(r.bookQty ?? 0),
    itemLines: Number(r.itemLines ?? 0),
  }));
}

export async function paymentBreakdown(
  tenantId: string,
  dataIni: string,
  dataFim: string,
): Promise<PaymentBreakdown[]> {
  const rows = await db
    .select({
      paymentMethod: orders.paymentMethod,
      count: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(
      and(
        periodFilter(tenantId, dataIni, dataFim),
        inArray(orders.status, [...DEBIT_STATUSES]),
      ),
    )
    .groupBy(orders.paymentMethod)
    .orderBy(desc(sql`SUM(${orders.totalAmount})`));

  return rows.map((r) => ({
    paymentMethod: r.paymentMethod,
    count: Number(r.count),
    total: Number(r.total),
  }));
}

export async function statusBreakdown(
  tenantId: string,
  dataIni: string,
  dataFim: string,
): Promise<StatusBreakdown[]> {
  const rows = await db
    .select({
      status: orders.status,
      count: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(periodFilter(tenantId, dataIni, dataFim))
    .groupBy(orders.status);

  const map = new Map(rows.map((r) => [r.status, r]));
  return ORDER_STATUSES.map((s) => {
    const r = map.get(s);
    return {
      status: s,
      count: Number(r?.count ?? 0),
      total: Number(r?.total ?? 0),
    };
  });
}

export async function topBooksSold(
  tenantId: string,
  dataIni: string,
  dataFim: string,
  limit = 10,
): Promise<TopBookRow[]> {
  const rows = await db
    .select({
      bookId: books.id,
      title: books.title,
      author: books.author,
      qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      revenue: sql<string>`COALESCE(SUM(${orderItems.quantity} * ${orderItems.unitPrice}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(books, eq(books.id, orderItems.bookId))
    .where(
      and(
        periodFilter(tenantId, dataIni, dataFim),
        inArray(orders.status, [...DEBIT_STATUSES]),
      ),
    )
    .groupBy(books.id, books.title, books.author)
    .orderBy(desc(sql`SUM(${orderItems.quantity})`))
    .limit(limit);

  return rows.map((r) => ({
    bookId: r.bookId,
    title: r.title,
    author: r.author,
    qty: Number(r.qty),
    revenue: Number(r.revenue),
  }));
}

export async function dailyRevenueSeries(
  tenantId: string,
  dataIni: string,
  dataFim: string,
): Promise<DailyRevenue[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${orders.orderDate}), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(
      and(
        periodFilter(tenantId, dataIni, dataFim),
        inArray(orders.status, [...DEBIT_STATUSES]),
      ),
    )
    .groupBy(sql`date_trunc('day', ${orders.orderDate})`)
    .orderBy(asc(sql`date_trunc('day', ${orders.orderDate})`));

  return rows.map((r) => ({
    day: r.day,
    total: Number(r.total),
    orders: Number(r.orders),
  }));
}

export type ClientRankingRow = {
  clientId: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  orders: number;
  spent: number;
  books: number;
  lastOrderAt: Date | null;
};

export type ClientRankingSort = "spent" | "orders" | "recency";

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ranking de clientes no período (só pedidos debitáveis). */
export async function rankClients(
  tenantId: string,
  dataIni: string,
  dataFim: string,
  sort: ClientRankingSort = "spent",
  limit = 20,
): Promise<ClientRankingRow[]> {
  const orderByExpr =
    sort === "orders"
      ? desc(sql`COUNT(${orders.id})`)
      : sort === "recency"
        ? desc(sql`MAX(${orders.orderDate})`)
        : desc(sql`COALESCE(SUM(${orders.totalAmount}), 0)`);

  const rows = await db
    .select({
      clientId: clients.id,
      name: clients.name,
      whatsapp: clients.whatsapp,
      email: clients.email,
      city: clients.city,
      orders: sql<number>`COUNT(${orders.id})::int`,
      spent: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      books: sql<number>`COALESCE((
        SELECT SUM(oi.quantity)::int
        FROM order_items oi
        INNER JOIN orders ox ON ox.id = oi.order_id
        WHERE ox.client_id = ${clients.id}
          AND ox.tenant_id = ${tenantId}
          AND ox.status IN ('Pago', 'Enviado', 'Entregue')
          AND ox.order_date >= ${startOfDay(dataIni)}
          AND ox.order_date <= ${endOfDay(dataFim)}
      ), 0)`,
      lastOrderAt: sql<string | Date | null>`MAX(${orders.orderDate})`,
    })
    .from(clients)
    .innerJoin(orders, eq(orders.clientId, clients.id))
    .where(
      and(
        eq(clients.tenantId, tenantId),
        periodFilter(tenantId, dataIni, dataFim),
        inArray(orders.status, [...DEBIT_STATUSES]),
      ),
    )
    .groupBy(
      clients.id,
      clients.name,
      clients.whatsapp,
      clients.email,
      clients.city,
    )
    .orderBy(orderByExpr)
    .limit(limit);

  return rows.map((r) => ({
    clientId: r.clientId,
    name: r.name,
    whatsapp: r.whatsapp,
    email: r.email,
    city: r.city,
    orders: Number(r.orders ?? 0),
    spent: Number(r.spent ?? 0),
    books: Number(r.books ?? 0),
    lastOrderAt: asDate(r.lastOrderAt),
  }));
}

export async function listStockReport(tenantId: string): Promise<StockRow[]> {
  const reservedByBook = db
    .select({
      bookId: orderItems.bookId,
      reserved: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`.as(
        "reserved",
      ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, "Aguardando Pagamento"),
      ),
    )
    .groupBy(orderItems.bookId)
    .as("rb");

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      stock: books.stock,
      reserved: sql<number>`COALESCE(${reservedByBook.reserved}, 0)::int`,
      salePrice: books.salePrice,
      location: books.location,
    })
    .from(books)
    .leftJoin(reservedByBook, eq(reservedByBook.bookId, books.id))
    .where(and(eq(books.tenantId, tenantId), isNull(books.archivedAt)))
    .orderBy(asc(books.title));

  return rows.map((r) => {
    const stock = Number(r.stock ?? 0);
    const reserved = Number(r.reserved ?? 0);
    return {
      id: r.id,
      title: r.title,
      author: r.author,
      stock,
      reserved,
      available: Math.max(stock - reserved, 0),
      salePrice: Number(r.salePrice ?? 0),
      location: r.location,
    };
  });
}
