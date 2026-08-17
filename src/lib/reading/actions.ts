"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { books, readingComments, readingLogs, readingPlans, readingPosts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import {
  getReadingPlan,
  pagesReadOn,
} from "@/lib/reading/queries";
import {
  isReadingStatus,
  parseRemindAt,
  todayInTimeZone,
} from "@/lib/reading/types";

function assertPersonal() {
  return getAuthContext().then((ctx) => {
    if (!ctx?.tenant) return { ok: false as const, error: "Não autenticado." };
    if (ctx.tenant.product !== "personal") {
      return { ok: false as const, error: "Só na biblioteca pessoal." };
    }
    if (ctx.role === "readonly") {
      return { ok: false as const, error: "Somente leitura." };
    }
    return {
      ok: true as const,
      ctx: { ...ctx, tenant: ctx.tenant },
    };
  });
}

function revalidateReading() {
  revalidatePath("/painel");
  revalidatePath("/painel/livros");
  revalidatePath("/painel/leitura");
  revalidatePath("/painel/comunidade");
}

export async function setReadingStatus(bookId: string, status: string) {
  const gate = await assertPersonal();
  if (!gate.ok) return gate;
  if (!isReadingStatus(status)) return { ok: false, error: "Status inválido." };

  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.tenantId, gate.ctx.tenant.id)))
    .limit(1);
  if (!book) return { ok: false, error: "Livro não encontrado." };

  const now = new Date();
  await db
    .update(books)
    .set({
      readingStatus: status,
      startedAt:
        status === "lendo" ? (book.startedAt ?? now) : book.startedAt,
      finishedAt: status === "lido" ? now : null,
      currentPage:
        status === "lido" && book.pages
          ? book.pages
          : status === "quero_ler"
            ? 0
            : book.currentPage,
      updatedAt: now,
    })
    .where(eq(books.id, bookId));

  revalidateReading();
  revalidatePath(`/painel/livros/${bookId}`);
  return { ok: true };
}

export async function setCurrentPage(bookId: string, page: number) {
  const gate = await assertPersonal();
  if (!gate.ok) return gate;
  const next = Math.floor(Number(page));
  if (!Number.isFinite(next) || next < 0 || next > 20000) {
    return { ok: false, error: "Página inválida." };
  }

  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.tenantId, gate.ctx.tenant.id)))
    .limit(1);
  if (!book) return { ok: false, error: "Livro não encontrado." };

  const capped = book.pages ? Math.min(next, book.pages) : next;
  const now = new Date();
  const moving =
    book.readingStatus === "quero_ler" || book.readingStatus === "abandonado";
  await db
    .update(books)
    .set({
      currentPage: capped,
      readingStatus: moving ? "lendo" : book.readingStatus,
      startedAt: book.startedAt ?? now,
      updatedAt: now,
    })
    .where(eq(books.id, bookId));

  revalidateReading();
  revalidatePath(`/painel/livros/${bookId}`);
  return { ok: true, currentPage: capped };
}

export async function logPagesRead(input: {
  bookId?: string;
  pages: number;
}) {
  const gate = await assertPersonal();
  if (!gate.ok) return gate;
  const pages = Math.floor(Number(input.pages));
  if (!Number.isFinite(pages) || pages < 1 || pages > 2000) {
    return { ok: false, error: "Informe quantas páginas leu hoje." };
  }

  const tenantId = gate.ctx.tenant.id;
  const plan = await getReadingPlan(tenantId);
  const tz = plan?.timezone || "America/Sao_Paulo";
  const day = todayInTimeZone(tz);

  const bookId = input.bookId?.trim() || null;
  if (bookId) {
    const [book] = await db
      .select()
      .from(books)
      .where(and(eq(books.id, bookId), eq(books.tenantId, tenantId)))
      .limit(1);
    if (!book) return { ok: false, error: "Livro não encontrado." };

    const nextPage = Math.max(0, book.currentPage + pages);
    const capped = book.pages ? Math.min(nextPage, book.pages) : nextPage;
    const now = new Date();
    await db
      .update(books)
      .set({
        currentPage: capped,
        readingStatus:
          book.readingStatus === "quero_ler" || book.readingStatus === "abandonado"
            ? "lendo"
            : book.readingStatus,
        startedAt: book.startedAt ?? now,
        updatedAt: now,
      })
      .where(eq(books.id, book.id));
  }

  const existing = await db
    .select({ id: readingLogs.id, pagesRead: readingLogs.pagesRead })
    .from(readingLogs)
    .where(
      and(
        eq(readingLogs.tenantId, tenantId),
        eq(readingLogs.readOn, day),
        bookId ? eq(readingLogs.bookId, bookId) : sql`${readingLogs.bookId} is null`,
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(readingLogs)
      .set({ pagesRead: existing[0].pagesRead + pages })
      .where(eq(readingLogs.id, existing[0].id));
  } else {
    await db.insert(readingLogs).values({
      tenantId,
      bookId,
      pagesRead: pages,
      readOn: day,
    });
  }

  revalidateReading();
  const today = await pagesReadOn(tenantId, day);
  return { ok: true, today };
}

export async function finishBook(input: {
  bookId: string;
  body?: string;
  share: boolean;
}) {
  const gate = await assertPersonal();
  if (!gate.ok) return gate;
  const [book] = await db
    .select()
    .from(books)
    .where(
      and(eq(books.id, input.bookId), eq(books.tenantId, gate.ctx.tenant.id)),
    )
    .limit(1);
  if (!book) return { ok: false, error: "Livro não encontrado." };

  const comment = input.body?.trim() || "";
  if (input.share && comment.length < 8) {
    return {
      ok: false,
      error: "Escreva um comentário (pelo menos uma frase) para postar na comunidade.",
    };
  }

  const now = new Date();
  await db
    .update(books)
    .set({
      readingStatus: "lido",
      currentPage: book.pages ?? book.currentPage,
      finishedAt: now,
      startedAt: book.startedAt ?? now,
      updatedAt: now,
    })
    .where(eq(books.id, book.id));

  if (input.share) {
    await db.insert(readingPosts).values({
      tenantId: gate.ctx.tenant.id,
      bookId: book.id,
      body: comment.slice(0, 2000),
      displayName: gate.ctx.user.name.trim() || "Leitor",
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
    });
  }

  revalidateReading();
  revalidatePath(`/painel/livros/${book.id}`);
  return { ok: true };
}

export async function saveReadingPlan(input: {
  dailyPages: number;
  remindAt: string;
  enabled: boolean;
}) {
  const gate = await assertPersonal();
  if (!gate.ok) return gate;
  const dailyPages = Math.floor(Number(input.dailyPages));
  if (!Number.isFinite(dailyPages) || dailyPages < 1 || dailyPages > 500) {
    return { ok: false, error: "Meta diária entre 1 e 500 páginas." };
  }
  const hm = parseRemindAt(input.remindAt);
  const remindAt = `${String(hm.hour).padStart(2, "0")}:${String(hm.minute).padStart(2, "0")}`;

  const existing = await getReadingPlan(gate.ctx.tenant.id);
  if (existing) {
    await db
      .update(readingPlans)
      .set({
        dailyPages,
        remindAt,
        enabled: Boolean(input.enabled),
        updatedAt: new Date(),
      })
      .where(eq(readingPlans.id, existing.id));
  } else {
    await db.insert(readingPlans).values({
      tenantId: gate.ctx.tenant.id,
      dailyPages,
      remindAt,
      enabled: Boolean(input.enabled),
      timezone: "America/Sao_Paulo",
    });
  }
  revalidatePath("/painel/leitura");
  revalidatePath("/painel");
  return { ok: true };
}

export async function commentOnPost(postId: string, body: string) {
  const gate = await assertPersonal();
  if (!gate.ok) return gate;
  const text = body.trim();
  if (text.length < 2 || text.length > 500) {
    return { ok: false, error: "Comentário entre 2 e 500 caracteres." };
  }
  const [post] = await db
    .select({ id: readingPosts.id })
    .from(readingPosts)
    .where(eq(readingPosts.id, postId))
    .limit(1);
  if (!post) return { ok: false, error: "Post não encontrado." };

  await db.insert(readingComments).values({
    postId,
    tenantId: gate.ctx.tenant.id,
    body: text,
    displayName: gate.ctx.user.name.trim() || "Leitor",
  });
  revalidatePath("/painel/comunidade");
  return { ok: true };
}
