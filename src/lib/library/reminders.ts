import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  books,
  clientProfiles,
  clients,
  loans,
  tenants,
  whatsappConnections,
} from "@/db/schema";
import { getRedis } from "@/lib/redis";
import { markOverdueLoans } from "@/lib/library/actions";
import {
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";

type DueKind = "tomorrow" | "overdue";

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function remindKey(kind: DueKind, loanId: string, day: string) {
  return `ga:lib:remind:${kind}:${loanId}:${day}`;
}

async function alreadySent(kind: DueKind, loanId: string) {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    return Boolean(await redis.get(remindKey(kind, loanId, dayKey())));
  } catch {
    return false;
  }
}

async function markSent(kind: DueKind, loanId: string) {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    await redis.set(remindKey(kind, loanId, dayKey()), "1", "EX", 60 * 60 * 36);
  } catch {
    // ignore
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

export async function runLibraryLoanReminders() {
  await markOverdueLoans();
  const cfg = resolveEvolutionConfig();
  if (!cfg) return { sent: 0, skipped: 0, reason: "evolution_off" };
  const evo = cfg;

  const dueTomorrow = await db
    .select({
      loanId: loans.id,
      tenantId: loans.tenantId,
      title: books.title,
      dueAt: loans.dueAt,
      readerName: clients.name,
      whatsapp: clients.whatsapp,
      instanceName: whatsappConnections.instanceName,
      optIn: clientProfiles.optInNotices,
    })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(clients, eq(clients.id, loans.clientId))
    .innerJoin(tenants, eq(tenants.id, loans.tenantId))
    .innerJoin(
      whatsappConnections,
      eq(whatsappConnections.tenantId, loans.tenantId),
    )
    .leftJoin(clientProfiles, eq(clientProfiles.clientId, clients.id))
    .where(
      and(
        eq(tenants.product, "library"),
        inArray(loans.status, ["open", "overdue"]),
        eq(whatsappConnections.status, "open"),
        sql`${loans.dueAt} >= date_trunc('day', now() + interval '1 day')`,
        sql`${loans.dueAt} < date_trunc('day', now() + interval '2 day')`,
      ),
    );

  const overdue = await db
    .select({
      loanId: loans.id,
      tenantId: loans.tenantId,
      title: books.title,
      dueAt: loans.dueAt,
      readerName: clients.name,
      whatsapp: clients.whatsapp,
      instanceName: whatsappConnections.instanceName,
      optIn: clientProfiles.optInNotices,
    })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(clients, eq(clients.id, loans.clientId))
    .innerJoin(tenants, eq(tenants.id, loans.tenantId))
    .innerJoin(
      whatsappConnections,
      eq(whatsappConnections.tenantId, loans.tenantId),
    )
    .leftJoin(clientProfiles, eq(clientProfiles.clientId, clients.id))
    .where(
      and(
        eq(tenants.product, "library"),
        inArray(loans.status, ["open", "overdue"]),
        eq(whatsappConnections.status, "open"),
        sql`${loans.dueAt} < now()`,
      ),
    );

  let sent = 0;
  let skipped = 0;

  async function sendOne(
    kind: DueKind,
    row: (typeof dueTomorrow)[number],
    text: string,
  ) {
    if (!row.whatsapp || row.optIn !== true) {
      skipped += 1;
      return;
    }
    if (await alreadySent(kind, row.loanId)) {
      skipped += 1;
      return;
    }
    try {
      await sendTextMessage(evo, row.instanceName, row.whatsapp, text);
      await markSent(kind, row.loanId);
      sent += 1;
    } catch {
      skipped += 1;
    }
  }

  for (const row of dueTomorrow) {
    await sendOne(
      "tomorrow",
      row,
      `Olá, ${row.readerName}! O empréstimo de *${row.title}* vence amanhã (${fmtDate(row.dueAt)}). Responda *renovar* se quiser mais prazo.`,
    );
  }
  for (const row of overdue) {
    await sendOne(
      "overdue",
      row,
      `Olá, ${row.readerName}. O empréstimo de *${row.title}* está atrasado (venceu em ${fmtDate(row.dueAt)}). Responda *renovar* ou devolva na biblioteca.`,
    );
  }

  return {
    sent,
    skipped,
    dueTomorrow: dueTomorrow.length,
    overdue: overdue.length,
  };
}
