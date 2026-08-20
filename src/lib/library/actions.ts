"use server";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { clientProfiles, clients, copies, loans, tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";
import {
  getLibraryPolicy,
  withLibraryPolicy,
  type LibraryPolicy,
} from "@/lib/library/policy";
import {
  normalizeLoanCondition,
  normalizeLoanPhoto,
} from "@/lib/library/condition";
import {
  searchCopiesOrTitles,
  searchReaders,
} from "@/lib/library/queries";

export type LoanActionResult =
  | { ok: true; id: string; dueAt?: string }
  | { ok: false; error: string };

function addDays(from: Date, days: number) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

async function requireLibraryWrite() {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false as const, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "lending");
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (ctx.tenant.product !== "library") {
    return { ok: false as const, error: "Esta conta não é biblioteca." };
  }
  return { ok: true as const, ctx };
}

async function loadPolicy(tenantId: string): Promise<LibraryPolicy> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return getLibraryPolicy(row?.settings);
}

export async function saveLibraryPolicy(
  input: unknown,
): Promise<LoanActionResult> {
  const gate = await requireLibraryWrite();
  if (!gate.ok) return gate;
  const parsed = z
    .object({
      loanDays: z.coerce.number().int().min(1).max(90),
      maxOpenLoans: z.coerce.number().int().min(1).max(20),
      maxRenewals: z.coerce.number().int().min(0).max(10),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Política inválida." };
  }
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, gate.ctx.tenant.id))
    .limit(1);
  await db
    .update(tenants)
    .set({
      settings: withLibraryPolicy(row?.settings, parsed.data),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, gate.ctx.tenant.id));
  revalidatePath("/painel/circulacao");
  return { ok: true, id: gate.ctx.tenant.id };
}

const quickReaderSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(200),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  optIn: z.boolean().optional().default(true),
});

export async function quickCreateReader(
  input: unknown,
): Promise<LoanActionResult> {
  const gate = await requireLibraryWrite();
  if (!gate.ok) return gate;
  const parsed = quickReaderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const waRaw = parsed.data.whatsapp?.replace(/\D/g, "") || null;
  const [row] = await db
    .insert(clients)
    .values({
      tenantId: gate.ctx.tenant.id,
      name: parsed.data.nome,
      whatsapp: waRaw,
    })
    .returning({ id: clients.id });

  if (waRaw) {
    await db.insert(clientProfiles).values({
      tenantId: gate.ctx.tenant.id,
      clientId: row.id,
      optInNotices: parsed.data.optIn !== false,
      onboardingStatus: "skipped",
      onboardingStep: "done",
    });
  }

  revalidatePath("/painel/clientes");
  revalidatePath("/painel/circulacao");
  return { ok: true, id: row.id };
}

export async function checkoutLoan(input: {
  clientId: string;
  copyId?: string;
  bookId?: string;
  photoUrl?: string | null;
  condition?: unknown;
}): Promise<LoanActionResult> {
  const gate = await requireLibraryWrite();
  if (!gate.ok) return gate;
  const tenantId = gate.ctx.tenant.id;
  const policy = await loadPolicy(tenantId);

  let photoUrl: string | null = null;
  let condition = null;
  try {
    photoUrl = normalizeLoanPhoto(input.photoUrl);
    condition = normalizeLoanCondition(input.condition);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const [reader] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  if (!reader) return { ok: false, error: "Leitor não encontrado." };

  const [openCount] = await db
    .select({ n: count() })
    .from(loans)
    .where(
      and(
        eq(loans.tenantId, tenantId),
        eq(loans.clientId, reader.id),
        inArray(loans.status, ["open", "overdue"]),
      ),
    );
  if (Number(openCount?.n ?? 0) >= policy.maxOpenLoans) {
    return {
      ok: false,
      error: `Este leitor já tem ${policy.maxOpenLoans} empréstimo(s) aberto(s).`,
    };
  }

  let copyId = input.copyId?.trim() || "";
  if (!copyId && input.bookId) {
    const [avail] = await db
      .select({ id: copies.id })
      .from(copies)
      .where(
        and(
          eq(copies.tenantId, tenantId),
          eq(copies.bookId, input.bookId),
          eq(copies.status, "available"),
        ),
      )
      .limit(1);
    copyId = avail?.id || "";
  }
  if (!copyId) return { ok: false, error: "Nenhum exemplar disponível." };

  const [copy] = await db
    .select()
    .from(copies)
    .where(and(eq(copies.id, copyId), eq(copies.tenantId, tenantId)))
    .limit(1);
  if (!copy) return { ok: false, error: "Exemplar não encontrado." };
  if (copy.status !== "available") {
    return { ok: false, error: "Este exemplar não está disponível." };
  }

  const now = new Date();
  const dueAt = addDays(now, policy.loanDays);

  try {
    const [loan] = await db
      .insert(loans)
      .values({
        tenantId,
        copyId: copy.id,
        bookId: copy.bookId,
        clientId: reader.id,
        borrowedAt: now,
        dueAt,
        status: "open",
        checkoutPhotoUrl: photoUrl,
        checkoutCondition: condition,
      })
      .returning({ id: loans.id });

    await db
      .update(copies)
      .set({ status: "on_loan", updatedAt: now })
      .where(eq(copies.id, copy.id));

    revalidatePath("/painel/circulacao");
    revalidatePath("/painel");
    revalidatePath(`/painel/clientes/${reader.id}`);
    return { ok: true, id: loan.id, dueAt: dueAt.toISOString() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao emprestar: ${msg}` };
  }
}

export async function returnLoan(
  loanId: string,
  opts?: { photoUrl?: string | null; condition?: unknown },
): Promise<LoanActionResult> {
  const gate = await requireLibraryWrite();
  if (!gate.ok) return gate;
  return returnLoanInternal(gate.ctx.tenant.id, loanId, opts);
}

export async function returnLoanInternal(
  tenantId: string,
  loanId: string,
  opts?: { photoUrl?: string | null; condition?: unknown },
): Promise<LoanActionResult> {
  const [loan] = await db
    .select()
    .from(loans)
    .where(and(eq(loans.id, loanId), eq(loans.tenantId, tenantId)))
    .limit(1);
  if (!loan) return { ok: false, error: "Empréstimo não encontrado." };
  if (loan.status === "returned" || loan.returnedAt) {
    return { ok: false, error: "Este empréstimo já foi devolvido." };
  }

  let photoUrl: string | null = null;
  let condition = null;
  try {
    photoUrl = normalizeLoanPhoto(opts?.photoUrl);
    condition = normalizeLoanCondition(opts?.condition);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const now = new Date();
  await db
    .update(loans)
    .set({
      returnedAt: now,
      status: "returned",
      returnPhotoUrl: photoUrl,
      returnCondition: condition,
      updatedAt: now,
    })
    .where(eq(loans.id, loan.id));
  await db
    .update(copies)
    .set({ status: "available", updatedAt: now })
    .where(eq(copies.id, loan.copyId));

  revalidatePath("/painel/circulacao");
  revalidatePath("/painel");
  return { ok: true, id: loan.id };
}

export async function renewLoan(loanId: string): Promise<LoanActionResult> {
  const gate = await requireLibraryWrite();
  if (!gate.ok) return gate;
  return renewLoanInternal(gate.ctx.tenant.id, loanId);
}

export async function renewLoanInternal(
  tenantId: string,
  loanId: string,
): Promise<LoanActionResult> {
  const policy = await loadPolicy(tenantId);
  const [loan] = await db
    .select()
    .from(loans)
    .where(and(eq(loans.id, loanId), eq(loans.tenantId, tenantId)))
    .limit(1);
  if (!loan) return { ok: false, error: "Empréstimo não encontrado." };
  if (loan.status === "returned" || loan.returnedAt) {
    return { ok: false, error: "Não dá para renovar um empréstimo devolvido." };
  }
  if (loan.renewedCount >= policy.maxRenewals) {
    return {
      ok: false,
      error: `Limite de ${policy.maxRenewals} renovação(ões) atingido.`,
    };
  }

  const now = new Date();
  const base = loan.dueAt.getTime() > now.getTime() ? loan.dueAt : now;
  const dueAt = addDays(base, policy.loanDays);
  await db
    .update(loans)
    .set({
      dueAt,
      renewedCount: loan.renewedCount + 1,
      status: "open",
      updatedAt: now,
    })
    .where(eq(loans.id, loan.id));

  revalidatePath("/painel/circulacao");
  revalidatePath("/painel");
  return { ok: true, id: loan.id, dueAt: dueAt.toISOString() };
}

export async function markOverdueLoans(tenantId?: string) {
  await db
    .update(loans)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        tenantId ? eq(loans.tenantId, tenantId) : undefined,
        eq(loans.status, "open"),
        sql`${loans.dueAt} < now()`,
      ),
    );
}

export async function searchCirculationReaders(q: string) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant || ctx.tenant.product !== "library") return [];
  return searchReaders(ctx.tenant.id, q);
}

export async function searchCirculationCopies(q: string) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant || ctx.tenant.product !== "library") return [];
  return searchCopiesOrTitles(ctx.tenant.id, q);
}
