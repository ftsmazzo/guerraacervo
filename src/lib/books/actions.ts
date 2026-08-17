"use server";

import { and, eq, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bookTags, books, orderItems, orders, tags } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";
import { assertCanAddBook } from "@/lib/tenant-limits";

const CONDITIONS = ["Novo", "Ótimo", "Bom", "Regular"] as const;
const COVER_TYPES = ["Brochura", "Capa Dura"] as const;

const bookInputSchema = z.object({
  isbn: z.string().trim().max(32).optional().nullable(),
  titulo: z.string().trim().min(1, "Título é obrigatório."),
  autor: z.string().trim().max(200).optional().nullable(),
  editora: z.string().trim().max(200).optional().nullable(),
  ano: z.coerce.number().int().min(1000).max(2100).optional().nullable(),
  sinopse: z.string().optional().nullable(),
  paginas: z.coerce.number().int().positive().optional().nullable(),
  capaUrl: z
    .string()
    .trim()
    .max(1_200_000, "URL/capa muito grande.")
    .optional()
    .nullable(),
  genero: z.string().trim().max(100).optional().nullable(),
  idioma: z.string().trim().max(60).optional().default("Português"),
  peso: z.coerce
    .number({ error: "Peso em gramas é obrigatório." })
    .int()
    .positive("Peso em gramas é obrigatório."),
  estado: z.enum(CONDITIONS, {
    error: "Estado de conservação é obrigatório.",
  }),
  tipoCapa: z.enum(COVER_TYPES).default("Brochura"),
  precoCompra: z.coerce.number().nonnegative().optional().nullable(),
  precoVenda: z.coerce
    .number({ error: "Preço de venda inválido." })
    .positive("Preço de venda inválido."),
  estoque: z.coerce.number().int().min(0).default(1),
  localizacao: z.string().trim().max(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).optional().default([]),
});

export type BookInput = z.infer<typeof bookInputSchema>;

export type BookActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; errors?: string[] };

const personalBookInputSchema = bookInputSchema.extend({
  peso: z.coerce.number().int().positive().optional().default(300),
  estado: z.enum(CONDITIONS).optional().default("Bom"),
  precoVenda: z.coerce.number().nonnegative().optional().default(0),
  estoque: z.coerce.number().int().min(0).optional().default(1),
});

function parseBookInput(input: unknown, product: string) {
  return product === "personal"
    ? personalBookInputSchema.safeParse(input)
    : bookInputSchema.safeParse(input);
}

function normalizeTags(raw: string[]): string[] {
  return [
    ...new Set(
      raw
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 60),
    ),
  ];
}

async function syncBookTags(
  tenantId: string,
  bookId: string,
  tagNames: string[],
) {
  await db.delete(bookTags).where(eq(bookTags.bookId, bookId));
  if (!tagNames.length) return;

  for (const name of tagNames) {
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.name, name)))
      .limit(1);

    let tagId = existing[0]?.id;
    if (!tagId) {
      const [inserted] = await db
        .insert(tags)
        .values({ tenantId, name })
        .returning({ id: tags.id });
      tagId = inserted.id;
    }

    await db
      .insert(bookTags)
      .values({ bookId, tagId })
      .onConflictDoNothing();
  }
}

function toDbValues(
  data: BookInput,
  tenantId: string,
  product: string,
) {
  return {
    tenantId,
    isbn: data.isbn?.trim() || null,
    title: data.titulo,
    author: data.autor?.trim() || null,
    publisher: data.editora?.trim() || null,
    year: data.ano ?? null,
    synopsis: data.sinopse?.trim() || null,
    pages: data.paginas ?? null,
    coverUrl: data.capaUrl?.trim() || null,
    genre: data.genero?.trim() || null,
    language: data.idioma || "Português",
    weightGrams: data.peso ?? 300,
    condition: data.estado,
    coverType: data.tipoCapa,
    purchasePrice:
      data.precoCompra != null ? String(data.precoCompra) : null,
    salePrice: String(data.precoVenda),
    stock: data.estoque,
    location: data.localizacao?.trim() || null,
    ...(product === "personal"
      ? { readingStatus: "quero_ler" as const }
      : {}),
    updatedAt: new Date(),
  };
}

export async function createBook(
  input: unknown,
): Promise<BookActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "catalog");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const parsed = parseBookInput(input, ctx.tenant.product);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    return {
      ok: false,
      error: errors[0] || "Dados inválidos.",
      errors,
    };
  }

  const limit = await assertCanAddBook(ctx.tenant.id, ctx.tenant.planCode);
  if (!limit.ok) {
    return { ok: false, error: limit.error };
  }

  const tagNames = normalizeTags(parsed.data.tags || []);
  const values = toDbValues(parsed.data, ctx.tenant.id, ctx.tenant.product);

  try {
    const [row] = await db
      .insert(books)
      .values(values)
      .returning({ id: books.id });
    await syncBookTags(ctx.tenant.id, row.id, tagNames);
    revalidatePath("/painel/livros");
    if (ctx.tenant.product === "business") {
    try {
      const { enqueueNewBookNotice } = await import("@/lib/whatsapp/notify");
      await enqueueNewBookNotice({
        type: "new_book",
        tenantId: ctx.tenant.id,
        bookId: row.id,
        title: values.title,
        author: values.author,
        salePrice: String(values.salePrice),
      });
    } catch {
      // notificação não bloqueia cadastro
    }
    }
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /value too long|too large|payload/i.test(msg)
        ? "Capa ou texto grande demais para gravar. Use URL de capa ou foto menor."
        : `Falha ao gravar: ${msg}`,
    };
  }
}

export async function updateBook(
  id: string,
  input: unknown,
): Promise<BookActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "catalog");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!id) return { ok: false, error: "ID inválido." };

  const parsed = parseBookInput(input, ctx.tenant.product);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    return {
      ok: false,
      error: errors[0] || "Dados inválidos.",
      errors,
    };
  }

  const [existing] = await db
    .select({ id: books.id })
    .from(books)
    .where(and(eq(books.id, id), eq(books.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) return { ok: false, error: "Livro não encontrado." };

  const tagNames = normalizeTags(parsed.data.tags || []);
  const values = toDbValues(parsed.data, ctx.tenant.id, "business");
  // tenantId não deve mudar no update; readingStatus é da estante, não da ficha
  const { tenantId: _, ...updateValues } = values;
  void _;

  try {
    await db
      .update(books)
      .set(updateValues)
      .where(and(eq(books.id, id), eq(books.tenantId, ctx.tenant.id)));

    await syncBookTags(ctx.tenant.id, id, tagNames);

    revalidatePath("/painel/livros");
    revalidatePath(`/painel/livros/${id}`);
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /value too long|too large|payload/i.test(msg)
        ? "Capa ou texto grande demais para gravar. Use URL de capa ou foto menor."
        : `Falha ao gravar: ${msg}`,
    };
  }
}

export async function deleteBook(id: string): Promise<BookActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "catalog");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!id) return { ok: false, error: "ID inválido." };

  const [existing] = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(and(eq(books.id, id), eq(books.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) return { ok: false, error: "Livro não encontrado." };

  const [active] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.bookId, id),
        eq(orders.tenantId, ctx.tenant.id),
        notInArray(orders.status, ["Cancelado", "Entregue"]),
      ),
    );

  if (Number(active?.value ?? 0) > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: livro está em pedido(s) ativo(s).",
    };
  }

  await db
    .delete(books)
    .where(and(eq(books.id, id), eq(books.tenantId, ctx.tenant.id)));

  revalidatePath("/painel/livros");
  return { ok: true, id };
}

/** Wrapper EN usado pelo BookForm client — lança Error em falha */
export async function saveBook(input: {
  id?: string;
  isbn?: string | null;
  title: string;
  author?: string | null;
  publisher?: string | null;
  year?: number | null;
  synopsis?: string | null;
  pages?: number | null;
  coverUrl?: string | null;
  genre?: string | null;
  language?: string | null;
  weightGrams: number;
  condition: "Novo" | "Ótimo" | "Bom" | "Regular";
  coverType: "Brochura" | "Capa Dura";
  purchasePrice?: string | number | null;
  salePrice: string | number;
  stock: number;
  location?: string | null;
  tags?: string[];
}): Promise<{ ok: true; id: string }> {
  const mapped = {
    isbn: input.isbn,
    titulo: input.title,
    autor: input.author,
    editora: input.publisher,
    ano: input.year,
    sinopse: input.synopsis,
    paginas: input.pages,
    capaUrl: input.coverUrl,
    genero: input.genre,
    idioma: input.language || "Português",
    peso: input.weightGrams,
    estado: input.condition,
    tipoCapa: input.coverType,
    precoCompra:
      input.purchasePrice === "" || input.purchasePrice == null
        ? null
        : Number(input.purchasePrice),
    precoVenda: Number(input.salePrice),
    estoque: input.stock,
    localizacao: input.location,
    tags: input.tags || [],
  };

  const result = input.id
    ? await updateBook(input.id, mapped)
    : await createBook(mapped);

  if (!result.ok) throw new Error(result.error);
  return { ok: true, id: result.id };
}

export type BatchBookSaveItem = {
  titulo: string;
  autor?: string | null;
  editora?: string | null;
  ano?: number | null;
  isbn?: string | null;
  sinopse?: string | null;
  paginas?: number | null;
  capaUrl?: string | null;
  genero?: string | null;
  idioma?: string | null;
  peso: number;
  estado: "Novo" | "Ótimo" | "Bom" | "Regular";
  tipoCapa?: "Brochura" | "Capa Dura";
  precoVenda: number;
  estoque?: number;
  tags?: string[];
};

export type CreateBooksBatchResult = {
  ok: boolean;
  saved: Array<{ index: number; id: string; titulo: string }>;
  errors: Array<{ index: number; titulo: string; error: string }>;
};

/** Grava vários livros; continua se um item falhar. */
export async function createBooksBatch(
  items: BatchBookSaveItem[],
): Promise<CreateBooksBatchResult> {
  const saved: CreateBooksBatchResult["saved"] = [];
  const errors: CreateBooksBatchResult["errors"] = [];

  if (!Array.isArray(items) || !items.length) {
    return { ok: false, saved, errors: [{ index: -1, titulo: "", error: "Nenhum livro." }] };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const res = await createBook({
      isbn: item.isbn,
      titulo: item.titulo,
      autor: item.autor,
      editora: item.editora,
      ano: item.ano,
      sinopse: item.sinopse,
      paginas: item.paginas,
      capaUrl: item.capaUrl,
      genero: item.genero,
      idioma: item.idioma || "Português",
      peso: item.peso,
      estado: item.estado,
      tipoCapa: item.tipoCapa || "Brochura",
      precoVenda: item.precoVenda,
      estoque: item.estoque ?? 1,
      tags: item.tags || [],
    });
    if (res.ok) {
      saved.push({ index: i, id: res.id, titulo: item.titulo });
    } else {
      errors.push({
        index: i,
        titulo: item.titulo || `(item ${i + 1})`,
        error: res.error,
      });
    }
  }

  revalidatePath("/painel/livros");
  return { ok: saved.length > 0, saved, errors };
}
