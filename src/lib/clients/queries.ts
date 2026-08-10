import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, orders } from "@/db/schema";

export type ListClientsFilters = {
  busca?: string;
};

export type ClientListItem = {
  id: string;
  name: string;
  cpf: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  createdAt: Date;
  totalOrders: number;
  totalSpent: string;
};

export type ClientDetail = {
  id: string;
  name: string;
  cpf: string | null;
  whatsapp: string | null;
  email: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalOrders: number;
  totalSpent: string;
  totalWeight: number;
};

export async function countTenantClients(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(clients)
    .where(eq(clients.tenantId, tenantId));
  return row?.n ?? 0;
}

export async function listClients(
  tenantId: string,
  filters: ListClientsFilters = {},
): Promise<ClientListItem[]> {
  const conditions: SQL[] = [eq(clients.tenantId, tenantId)];
  const q = filters.busca?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(clients.name, like),
        ilike(clients.email, like),
        ilike(clients.whatsapp, like),
        ilike(clients.cpf, like),
        ilike(clients.city, like),
      )!,
    );
  }

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      cpf: clients.cpf,
      whatsapp: clients.whatsapp,
      email: clients.email,
      city: clients.city,
      state: clients.state,
      createdAt: clients.createdAt,
      totalOrders: sql<number>`coalesce(count(${orders.id}), 0)`.mapWith(Number),
      totalSpent: sql<string>`coalesce(sum(case when ${orders.status} in ('Pago','Enviado','Entregue') then ${orders.totalAmount}::numeric else 0 end), 0)`,
    })
    .from(clients)
    .leftJoin(orders, eq(orders.clientId, clients.id))
    .where(and(...conditions))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));

  return rows;
}

export async function getClient(
  tenantId: string,
  id: string,
): Promise<ClientDetail | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;

  const [totals] = await db
    .select({
      totalOrders: sql<number>`coalesce(count(*), 0)`.mapWith(Number),
      totalSpent: sql<string>`coalesce(sum(case when ${orders.status} in ('Pago','Enviado','Entregue') then ${orders.totalAmount}::numeric else 0 end), 0)`,
      totalWeight: sql<number>`coalesce(sum(case when ${orders.status} in ('Pago','Enviado','Entregue') then coalesce(${orders.totalWeight}, 0) else 0 end), 0)`.mapWith(
        Number,
      ),
    })
    .from(orders)
    .where(and(eq(orders.clientId, id), eq(orders.tenantId, tenantId)));

  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    whatsapp: row.whatsapp,
    email: row.email,
    cep: row.cep,
    street: row.street,
    number: row.number,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    totalOrders: totals?.totalOrders ?? 0,
    totalSpent: totals?.totalSpent ?? "0",
    totalWeight: totals?.totalWeight ?? 0,
  };
}
