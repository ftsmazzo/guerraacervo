import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookTags,
  books,
  clientInterestTags,
  clientProfiles,
  clients,
  tags,
} from "@/db/schema";
import { getRedis } from "@/lib/redis";
import {
  normalizePhone,
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";
import { isGenericInterestTag } from "@/lib/whatsapp/interest-tags";

const QUEUE_KEY = "ga:wa:notify";

export type NewBookNotifyJob = {
  type: "new_book";
  tenantId: string;
  bookId: string;
  title: string;
  author: string | null;
  salePrice: string;
};

export async function enqueueNewBookNotice(job: NewBookNotifyJob) {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    await redis.lpush(QUEUE_KEY, JSON.stringify(job));
    void drainNotifyQueue(8);
  } catch (e) {
    console.warn("[whatsapp] enqueue falhou:", e);
  }
}

async function bookInterestKeys(
  tenantId: string,
  bookId: string,
): Promise<string[]> {
  const [book] = await db
    .select({ genre: books.genre })
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.tenantId, tenantId)))
    .limit(1);

  const tagRows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(tags.id, bookTags.tagId))
    .where(eq(bookTags.bookId, bookId));

  const keys = new Set<string>();
  for (const t of tagRows) {
    const n = t.name.trim().toLowerCase();
    if (n && !isGenericInterestTag(n)) keys.add(n);
  }
  if (book?.genre?.trim() && !isGenericInterestTag(book.genre)) {
    keys.add(book.genre.trim().toLowerCase());
  }
  return [...keys];
}

async function recipientsForNewBook(tenantId: string, bookId: string) {
  const interestKeys = await bookInterestKeys(tenantId, bookId);

  const base = db
    .select({
      id: clients.id,
      name: clients.name,
      whatsapp: clients.whatsapp,
      tag: clientInterestTags.tag,
      tagId: clientInterestTags.id,
    })
    .from(clients)
    .innerJoin(clientProfiles, eq(clientProfiles.clientId, clients.id))
    .leftJoin(
      clientInterestTags,
      and(
        eq(clientInterestTags.clientId, clients.id),
        eq(clientInterestTags.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clientProfiles.optInNotices, true),
      ),
    );

  const rows = await base;
  const genericTagIds: string[] = [];
  const byClient = new Map<
    string,
    { id: string; name: string; whatsapp: string | null; matched?: string }
  >();

  for (const r of rows) {
    if (r.tag && isGenericInterestTag(r.tag) && r.tagId) {
      genericTagIds.push(r.tagId);
      continue;
    }
    const existing = byClient.get(r.id) || {
      id: r.id,
      name: r.name,
      whatsapp: r.whatsapp,
    };
    if (
      interestKeys.length &&
      r.tag &&
      interestKeys.includes(r.tag.toLowerCase())
    ) {
      existing.matched = r.tag;
    }
    byClient.set(r.id, existing);
  }

  if (genericTagIds.length) {
    await db
      .delete(clientInterestTags)
      .where(inArray(clientInterestTags.id, [...new Set(genericTagIds)]));
  }

  const all = [...byClient.values()].filter((c) => c.whatsapp);
  if (!interestKeys.length) return all.map((c) => ({ ...c, matched: undefined }));
  // Prefere match de tag; se ninguém bate, não spam — só quem tem interesse
  return all.filter((c) => c.matched);
}

export async function drainNotifyQueue(max = 20) {
  const cfg = resolveEvolutionConfig();
  if (!cfg) return { processed: 0, skipped: "no_config" as const };

  const redis = getRedis();
  if (redis.status !== "ready") {
    try {
      await redis.connect();
    } catch {
      return { processed: 0, skipped: "redis" as const };
    }
  }

  let processed = 0;
  for (let i = 0; i < max; i++) {
    const raw = await redis.rpop(QUEUE_KEY);
    if (!raw) break;
    try {
      const job = JSON.parse(raw) as NewBookNotifyJob;
      if (job.type !== "new_book") continue;

      const conn = await getWhatsappConnection(job.tenantId);
      if (!conn || conn.status !== "open") continue;

      const recipients = await recipientsForNewBook(job.tenantId, job.bookId);
      const price = Number(job.salePrice).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      for (const c of recipients) {
        const phone = normalizePhone(c.whatsapp || "");
        if (!phone) continue;
        const text = [
          `📚 *Novo no acervo!*`,
          `*${job.title}*`,
          job.author ? `Autor: ${job.author}` : null,
          `Preço: ${price}`,
          c.matched ? `Pelo seu interesse em _${c.matched}_.` : null,
          ``,
          `Quer reservar? Responda *reservar* ou peça *indicações*.`,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          await sendTextMessage(cfg, conn.instanceName, phone, text);
          processed += 1;
        } catch (err) {
          console.warn("[whatsapp] send falhou", c.id, err);
        }
      }
    } catch (e) {
      console.warn("[whatsapp] job inválido", e);
    }
  }
  return { processed };
}
