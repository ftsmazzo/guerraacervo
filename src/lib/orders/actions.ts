"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { books, clients, orderItems, orders } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";
import {
  DEBIT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { searchBooksForOrder } from "@/lib/orders/queries";

const itemSchema = z.object({
  bookId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
  unitPrice: z.coerce.number().nonnegative(),
});

const createOrderSchema = z.object({
  clienteId: z.string().uuid("Cliente inválido."),
  dataPedido: z.string().min(1, "Data é obrigatória."),
  formaPagamento: z.enum(PAYMENT_METHODS, {
    error: "Forma de pagamento inválida.",
  }),
  observacoes: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1, "Adicione pelo menos um livro."),
});

const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, { error: "Status inválido." }),
  codigoRastreio: z.string().trim().max(80).optional().nullable(),
});

export type OrderActionResult =
  | { ok: true; id: string; message?: string }
  | { ok: false; error: string; errors?: string[] };

function isDebitStatus(s: string): boolean {
  return DEBIT_STATUSES.includes(s as OrderStatus);
}

export async function searchOrderBooksAction(busca: string) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) return [];
  return searchBooksForOrder(ctx.tenant.id, busca);
}

export async function createOrder(input: unknown): Promise<OrderActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "orders");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    return { ok: false, error: errors[0] || "Dados inválidos.", errors };
  }

  const data = parsed.data;
  const tenantId = ctx.tenant.id;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, data.clienteId), eq(clients.tenantId, tenantId)))
    .limit(1);
  if (!client) return { ok: false, error: "Cliente não encontrado." };

  const bookIds = data.itens.map((i) => i.bookId);
  const booksFound = await db
    .select({
      id: books.id,
      title: books.title,
      stock: books.stock,
      weightGrams: books.weightGrams,
      salePrice: books.salePrice,
    })
    .from(books)
    .where(and(eq(books.tenantId, tenantId), inArray(books.id, bookIds)));

  const bookMap = new Map(booksFound.map((b) => [b.id, b]));

  // reserved counts
  const reservedRows = await db
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
  const reservedMap = new Map(
    reservedRows.map((r) => [r.bookId, Number(r.qty ?? 0)]),
  );

  // merge quantities if same book appears twice
  const qtyByBook = new Map<string, { quantity: number; unitPrice: number }>();
  for (const item of data.itens) {
    const prev = qtyByBook.get(item.bookId);
    if (prev) {
      prev.quantity += item.quantity;
    } else {
      qtyByBook.set(item.bookId, {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }
  }

  let totalWeight = 0;
  let totalAmount = 0;
  const resolvedItems: {
    bookId: string;
    quantity: number;
    unitPrice: string;
  }[] = [];

  for (const [bookId, item] of qtyByBook) {
    const book = bookMap.get(bookId);
    if (!book) {
      return { ok: false, error: "Um dos livros não foi encontrado." };
    }
    const reserved = reservedMap.get(bookId) ?? 0;
    const available = book.stock - reserved;
    if (item.quantity > available) {
      return {
        ok: false,
        error: `"${book.title}" tem apenas ${available} disponível(is).`,
      };
    }
    const weight = (book.weightGrams ?? 0) * item.quantity;
    totalWeight += weight;
    totalAmount += item.unitPrice * item.quantity;
    resolvedItems.push({
      bookId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
    });
  }

  const orderDate = new Date(`${data.dataPedido}T12:00:00`);

  try {
    const orderId = await db.transaction(async (tx) => {
      const [ord] = await tx
        .insert(orders)
        .values({
          tenantId,
          clientId: data.clienteId,
          orderDate,
          paymentMethod: data.formaPagamento as PaymentMethod,
          status: "Aguardando Pagamento",
          totalWeight,
          totalAmount: totalAmount.toFixed(2),
          notes: data.observacoes?.trim() || null,
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        resolvedItems.map((i) => ({
          orderId: ord.id,
          bookId: i.bookId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      );

      return ord.id;
    });

    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/livros");
    revalidatePath("/painel");
    revalidatePath(`/painel/clientes/${data.clienteId}`);
    return {
      ok: true,
      id: orderId,
      message: "Pedido criado. Livros reservados automaticamente.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao criar pedido: ${msg}` };
  }
}

export async function updateOrderStatus(
  id: string,
  input: unknown,
): Promise<OrderActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "orders");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!id) return { ok: false, error: "ID inválido." };

  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    return { ok: false, error: errors[0] || "Dados inválidos.", errors };
  }

  const tenantId = ctx.tenant.id;
  const novoStatus = parsed.data.status as OrderStatus;
  const rastreio = parsed.data.codigoRastreio?.trim() || null;

  const [pedido] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
    .limit(1);
  if (!pedido) return { ok: false, error: "Pedido não encontrado." };

  const statusAtual = pedido.status;
  const jaDebitado = isDebitStatus(statusAtual);
  const vaiDebitar = isDebitStatus(novoStatus);
  // Pago/Enviado/Entregue → Aguardando ou Cancelado: devolve estoque
  const deveDevolver = jaDebitado && !vaiDebitar;

  try {
    await db.transaction(async (tx) => {
      const itens = await tx
        .select({
          bookId: orderItems.bookId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, id));

      if (!jaDebitado && vaiDebitar) {
        for (const item of itens) {
          await tx
            .update(books)
            .set({
              stock: sql`GREATEST(0, ${books.stock} - ${item.quantity})`,
            })
            .where(
              and(eq(books.id, item.bookId), eq(books.tenantId, tenantId)),
            );
        }
      } else if (deveDevolver) {
        for (const item of itens) {
          await tx
            .update(books)
            .set({
              stock: sql`${books.stock} + ${item.quantity}`,
            })
            .where(
              and(eq(books.id, item.bookId), eq(books.tenantId, tenantId)),
            );
        }
      }

      await tx
        .update(orders)
        .set({
          status: novoStatus,
          trackingCode: rastreio,
        })
        .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
    });

    let message = `Status atualizado para '${novoStatus}'.`;
    if (vaiDebitar && !jaDebitado) {
      message += " Estoque atualizado.";
      try {
        const { applyPurchaseTagsFromOrder } = await import(
          "@/lib/whatsapp/queries"
        );
        await applyPurchaseTagsFromOrder(
          tenantId,
          pedido.clientId,
          id,
        );
      } catch {
        // tags de compra não bloqueiam status
      }
      if (novoStatus === "Pago") {
        try {
          const { inviteProfileAfterPaid } = await import(
            "@/lib/whatsapp/invite"
          );
          const inv = await inviteProfileAfterPaid({
            tenantId,
            clientId: pedido.clientId,
          });
          if (inv.sent) {
            message += " Convite de perfil enviado no WhatsApp.";
          }
        } catch {
          // convite WA não bloqueia status
        }
      }
    } else if (deveDevolver) message += " Estoque devolvido.";

    revalidatePath("/painel/pedidos");
    revalidatePath(`/painel/pedidos/${id}`);
    revalidatePath("/painel/livros");
    revalidatePath("/painel");
    revalidatePath(`/painel/clientes/${pedido.clientId}`);
    return { ok: true, id, message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao atualizar: ${msg}` };
  }
}
