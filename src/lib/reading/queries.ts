import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  books,
  readingComments,
  readingLogs,
  readingPlans,
  readingPosts,
  tenants,
} from "@/db/schema";
import { todayInTimeZone, type ReadingStatus } from "@/lib/reading/types";

export async function listBooksByReadingStatus(
  tenantId: string,
  status: ReadingStatus,
) {
  return db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      pages: books.pages,
      currentPage: books.currentPage,
      readingStatus: books.readingStatus,
      startedAt: books.startedAt,
      finishedAt: books.finishedAt,
    })
    .from(books)
    .where(and(eq(books.tenantId, tenantId), eq(books.readingStatus, status)))
    .orderBy(desc(books.updatedAt));
}

export async function countByReadingStatus(tenantId: string) {
  const rows = await db
    .select({
      status: books.readingStatus,
      n: sql<number>`count(*)::int`,
    })
    .from(books)
    .where(eq(books.tenantId, tenantId))
    .groupBy(books.readingStatus);
  const map: Record<ReadingStatus, number> = {
    quero_ler: 0,
    lendo: 0,
    lido: 0,
    abandonado: 0,
  };
  for (const r of rows) {
    map[r.status] = Number(r.n);
  }
  return map;
}

export async function listCurrentlyReading(tenantId: string, limit = 4) {
  return db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      pages: books.pages,
      currentPage: books.currentPage,
    })
    .from(books)
    .where(and(eq(books.tenantId, tenantId), eq(books.readingStatus, "lendo")))
    .orderBy(desc(books.updatedAt))
    .limit(limit);
}

export async function getReadingPlan(tenantId: string) {
  const [row] = await db
    .select()
    .from(readingPlans)
    .where(eq(readingPlans.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

export async function pagesReadOn(
  tenantId: string,
  day: string,
): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`coalesce(sum(${readingLogs.pagesRead}), 0)::int`,
    })
    .from(readingLogs)
    .where(
      and(eq(readingLogs.tenantId, tenantId), eq(readingLogs.readOn, day)),
    );
  return Number(row?.n ?? 0);
}

export async function readingStreak(tenantId: string, timeZone: string) {
  const logs = await db
    .select({
      day: readingLogs.readOn,
    })
    .from(readingLogs)
    .where(eq(readingLogs.tenantId, tenantId))
    .groupBy(readingLogs.readOn)
    .orderBy(desc(readingLogs.readOn));

  const days = new Set(
    logs.map((l) => {
      const d = l.day as unknown;
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    }),
  );
  let streak = 0;
  const cursor = new Date(`${todayInTimeZone(timeZone)}T12:00:00Z`);
  // If nothing logged today, start from yesterday.
  if (!days.has(todayInTimeZone(timeZone))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  for (let i = 0; i < 400; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function listReadingPosts(limit = 40) {
  return db
    .select({
      id: readingPosts.id,
      body: readingPosts.body,
      displayName: readingPosts.displayName,
      title: readingPosts.title,
      author: readingPosts.author,
      coverUrl: readingPosts.coverUrl,
      createdAt: readingPosts.createdAt,
      tenantId: readingPosts.tenantId,
    })
    .from(readingPosts)
    .innerJoin(tenants, eq(tenants.id, readingPosts.tenantId))
    .where(eq(tenants.product, "personal"))
    .orderBy(desc(readingPosts.createdAt))
    .limit(limit);
}

export async function listCommentsForPosts(postIds: string[]) {
  if (!postIds.length) return [];
  return db
    .select({
      id: readingComments.id,
      postId: readingComments.postId,
      body: readingComments.body,
      displayName: readingComments.displayName,
      createdAt: readingComments.createdAt,
      tenantId: readingComments.tenantId,
    })
    .from(readingComments)
    .where(inArray(readingComments.postId, postIds))
    .orderBy(readingComments.createdAt);
}

export async function weeklyFinishedTitles(limit = 6) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      title: readingPosts.title,
      author: readingPosts.author,
      coverUrl: readingPosts.coverUrl,
      n: sql<number>`count(*)::int`,
    })
    .from(readingPosts)
    .innerJoin(tenants, eq(tenants.id, readingPosts.tenantId))
    .where(and(eq(tenants.product, "personal"), gte(readingPosts.createdAt, weekAgo)))
    .groupBy(readingPosts.title, readingPosts.author, readingPosts.coverUrl)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => ({ ...r, n: Number(r.n) }));
}

export async function listEnabledReadingPlans() {
  return db
    .select({
      id: readingPlans.id,
      tenantId: readingPlans.tenantId,
      dailyPages: readingPlans.dailyPages,
      remindAt: readingPlans.remindAt,
      timezone: readingPlans.timezone,
      lastRemindedOn: readingPlans.lastRemindedOn,
    })
    .from(readingPlans)
    .innerJoin(tenants, eq(tenants.id, readingPlans.tenantId))
    .where(
      and(
        eq(readingPlans.enabled, true),
        eq(tenants.product, "personal"),
      ),
    );
}
