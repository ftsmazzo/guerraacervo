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
  capaUrl: z.string().trim().optional().nullable(),
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

function toDbValues(data: BookInput, tenantId: string) {
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
    weightGrams: data.peso,
    condition: data.estado,
    coverType: data.tipoCapa,
    purchasePrice:
      data.precoCompra != null ? String(data.precoCompra) : null,
    salePrice: String(data.precoVenda),
    stock: data.estoque,
    location: data.localizacao?.trim() || null,
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

  const parsed = bookInputSchema.safeParse(input);
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
  const values = toDbValues(parsed.data, ctx.tenant.id);

  const [row] = await db.insert(books).values(values).returning({ id: books.id });
  await syncBookTags(ctx.tenant.id, row.id, tagNames);

  revalidatePath("/painel/livros");
  return { ok: true, id: row.id };
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

  const parsed = bookInputSchema.safeParse(input);
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
  const values = toDbValues(parsed.data, ctx.tenant.id);
  // tenantId não deve mudar no update
  const { tenantId: _, ...updateValues } = values;
  void _;

  await db
    .update(books)
    .set(updateValues)
    .where(and(eq(books.id, id), eq(books.tenantId, ctx.tenant.id)));

  await syncBookTags(ctx.tenant.id, id, tagNames);

  revalidatePath("/painel/livros");
  revalidatePath(`/painel/livros/${id}`);
  return { ok: true, id };
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
