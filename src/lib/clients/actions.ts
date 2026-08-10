"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { clients, orders } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";

const clientInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(200),
  cpf: z.string().trim().max(20).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "E-mail inválido.",
    ),
  cep: z.string().trim().max(12).optional().nullable(),
  logradouro: z.string().trim().max(200).optional().nullable(),
  numero: z.string().trim().max(30).optional().nullable(),
  complemento: z.string().trim().max(120).optional().nullable(),
  bairro: z.string().trim().max(120).optional().nullable(),
  cidade: z.string().trim().max(120).optional().nullable(),
  estado: z
    .string()
    .trim()
    .max(2)
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : v)),
  observacoes: z.string().optional().nullable(),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export type ClientActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; errors?: string[] };

function emptyToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function toDbValues(data: ClientInput, tenantId: string) {
  return {
    tenantId,
    name: data.nome,
    cpf: emptyToNull(data.cpf),
    whatsapp: emptyToNull(data.whatsapp),
    email: emptyToNull(data.email),
    cep: emptyToNull(data.cep),
    street: emptyToNull(data.logradouro),
    number: emptyToNull(data.numero),
    complement: emptyToNull(data.complemento),
    district: emptyToNull(data.bairro),
    city: emptyToNull(data.cidade),
    state: emptyToNull(data.estado),
    notes: emptyToNull(data.observacoes),
  };
}

export async function createClient(
  input: unknown,
): Promise<ClientActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "clients");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    return { ok: false, error: errors[0] || "Dados inválidos.", errors };
  }

  try {
    const [row] = await db
      .insert(clients)
      .values(toDbValues(parsed.data, ctx.tenant.id))
      .returning({ id: clients.id });
    revalidatePath("/painel/clientes");
    revalidatePath("/painel");
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao gravar: ${msg}` };
  }
}

export async function updateClient(
  id: string,
  input: unknown,
): Promise<ClientActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "clients");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!id) return { ok: false, error: "ID inválido." };

  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => i.message);
    return { ok: false, error: errors[0] || "Dados inválidos.", errors };
  }

  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) return { ok: false, error: "Cliente não encontrado." };

  const { tenantId: _, ...updateValues } = toDbValues(
    parsed.data,
    ctx.tenant.id,
  );
  void _;

  try {
    await db
      .update(clients)
      .set(updateValues)
      .where(and(eq(clients.id, id), eq(clients.tenantId, ctx.tenant.id)));
    revalidatePath("/painel/clientes");
    revalidatePath(`/painel/clientes/${id}`);
    revalidatePath(`/painel/clientes/${id}/editar`);
    revalidatePath("/painel");
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao gravar: ${msg}` };
  }
}

export async function deleteClient(id: string): Promise<ClientActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "clients");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!id) return { ok: false, error: "ID inválido." };

  const [existing] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) return { ok: false, error: "Cliente não encontrado." };

  const [ord] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.clientId, id), eq(orders.tenantId, ctx.tenant.id)));
  if ((ord?.n ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Este cliente possui pedidos associados. Remova os pedidos antes de excluir.",
    };
  }

  try {
    await db
      .delete(clients)
      .where(and(eq(clients.id, id), eq(clients.tenantId, ctx.tenant.id)));
    revalidatePath("/painel/clientes");
    revalidatePath("/painel");
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao excluir: ${msg}` };
  }
}
