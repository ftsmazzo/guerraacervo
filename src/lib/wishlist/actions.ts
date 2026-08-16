"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { wishItems } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";

const wishSchema = z.object({
  isbn: z.string().trim().max(32).optional().nullable(),
  title: z.string().trim().min(1, "Título é obrigatório.").max(300),
  author: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function createWishItem(input: unknown) {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false as const, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "wishlist");
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }

  const parsed = wishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  const [row] = await db
    .insert(wishItems)
    .values({
      tenantId: ctx.tenant.id,
      isbn: parsed.data.isbn?.trim() || null,
      title: parsed.data.title,
      author: parsed.data.author?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
    })
    .returning({ id: wishItems.id });

  revalidatePath("/painel/desejos");
  return { ok: true as const, id: row.id };
}

export async function deleteWishItem(id: string) {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false as const, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "wishlist");
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
  if (!id) return { ok: false as const, error: "ID inválido." };

  await db
    .delete(wishItems)
    .where(and(eq(wishItems.id, id), eq(wishItems.tenantId, ctx.tenant.id)));
  revalidatePath("/painel/desejos");
  return { ok: true as const };
}
