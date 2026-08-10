import { eq, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  clientInterestTags,
  clientProfiles,
  clients,
  orderItems,
  orders,
} from "@/db/schema";

export const runtime = "nodejs";

/**
 * Limpeza pontual de dados de teste do WhatsApp.
 * POST /api/admin/purge-wa-test?secret=...
 * Body opcional: { "whatsapp": "16996480805" }
 */
export async function POST(request: Request) {
  const expected =
    process.env.WHATSAPP_WEBHOOK_SECRET || process.env.AUTH_SECRET || "";
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ||
    request.headers.get("x-admin-secret") ||
    "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let whatsappHint = "6480805";
  try {
    const body = (await request.json()) as { whatsapp?: string };
    if (body?.whatsapp?.trim()) whatsappHint = body.whatsapp.replace(/\D/g, "");
  } catch {
    // body opcional
  }

  const matched = await db
    .select({
      id: clients.id,
      name: clients.name,
      whatsapp: clients.whatsapp,
    })
    .from(clients)
    .where(
      or(
        ilike(clients.whatsapp, `%${whatsappHint}%`),
        ilike(clients.name, "%Frederico Mazzo%"),
        ilike(clients.name, "Cliente WhatsApp%"),
        sql`${clients.whatsapp} ~ '^[0-9]{14,}$'`, // LID gravado como telefone
      ),
    );

  const purged: Array<{
    id: string;
    name: string;
    whatsapp: string | null;
    orders: number;
  }> = [];

  for (const c of matched) {
    const ords = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.clientId, c.id));

    for (const o of ords) {
      await db.delete(orderItems).where(eq(orderItems.orderId, o.id));
      await db.delete(orders).where(eq(orders.id, o.id));
    }

    await db
      .delete(clientInterestTags)
      .where(eq(clientInterestTags.clientId, c.id));
    await db.delete(clientProfiles).where(eq(clientProfiles.clientId, c.id));
    await db.delete(clients).where(eq(clients.id, c.id));

    purged.push({
      id: c.id,
      name: c.name,
      whatsapp: c.whatsapp,
      orders: ords.length,
    });
  }

  return NextResponse.json({
    ok: true,
    purgedCount: purged.length,
    purged,
  });
}
