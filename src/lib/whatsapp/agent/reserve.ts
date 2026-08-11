import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { books, clients, orderItems, orders } from "@/db/schema";
import { notifySeboReservation } from "@/lib/tenant-alerts";

export type InternalOrderResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Reserva pedido sem sessão de painel (agente WhatsApp). */
export async function createOrderInternal(opts: {
  tenantId: string;
  clientId: string;
  bookId: string;
  quantity?: number;
  notes?: string | null;
}): Promise<InternalOrderResult> {
  const qty = Math.max(1, opts.quantity ?? 1);

  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(eq(clients.id, opts.clientId), eq(clients.tenantId, opts.tenantId)),
    )
    .limit(1);
  if (!client) return { ok: false, error: "Cliente não encontrado." };

  const [book] = await db
    .select({
      id: books.id,
      title: books.title,
      stock: books.stock,
      weightGrams: books.weightGrams,
      salePrice: books.salePrice,
    })
    .from(books)
    .where(and(eq(books.id, opts.bookId), eq(books.tenantId, opts.tenantId)))
    .limit(1);
  if (!book) return { ok: false, error: "Livro não encontrado." };

  const [reservedRow] = await db
    .select({
      qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, opts.tenantId),
        eq(orderItems.bookId, opts.bookId),
        eq(orders.status, "Aguardando Pagamento"),
      ),
    );
  const reserved = Number(reservedRow?.qty ?? 0);
  const available = book.stock - reserved;
  if (qty > available) {
    return {
      ok: false,
      error: `"${book.title}" tem apenas ${available} disponível(is).`,
    };
  }

  const unit = Number(book.salePrice);
  const totalWeight = (book.weightGrams ?? 0) * qty;
  const totalAmount = unit * qty;

  try {
    const orderId = await db.transaction(async (tx) => {
      const [ord] = await tx
        .insert(orders)
        .values({
          tenantId: opts.tenantId,
          clientId: opts.clientId,
          orderDate: new Date(),
          paymentMethod: "Pix",
          status: "Aguardando Pagamento",
          totalWeight,
          totalAmount: totalAmount.toFixed(2),
          notes: opts.notes?.trim() || "Reserva via WhatsApp",
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values({
        orderId: ord.id,
        bookId: book.id,
        quantity: qty,
        unitPrice: unit.toFixed(2),
      });

      return ord.id;
    });
    revalidatePath("/painel/livros", "layout");
    revalidatePath("/painel/livros", "page");
    revalidatePath("/painel/pedidos", "layout");
    revalidatePath(`/painel/pedidos/${orderId}`, "page");
    revalidatePath(`/painel/clientes/${opts.clientId}`, "page");
    revalidatePath("/painel", "layout");

    void notifySeboReservation({
      tenantId: opts.tenantId,
      orderId,
      bookTitle: book.title,
      clientName: client.name,
      source: "whatsapp",
    }).catch((e) => console.warn("[reserve] notify sebo", e));

    return { ok: true, id: orderId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
