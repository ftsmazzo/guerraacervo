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
import { setSuggestedBooks } from "@/lib/whatsapp/agent/debounce";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";
import {
  filterInterestTags,
  isGenericInterestTag,
} from "@/lib/whatsapp/interest-tags";

const QUEUE_KEY = "ga:wa:notify";

/** Cliente só é avisado se cruzar pelo menos N tags com o livro. */
export const MIN_INTEREST_TAG_OVERLAP = 1;

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

  const raw = tagRows.map((t) => t.name);
  if (book?.genre?.trim()) raw.push(book.genre);
  return filterInterestTags(raw);
}

type Recipient = {
  id: string;
  name: string;
  whatsapp: string | null;
  matched: string[];
};

async function recipientsForNewBook(
  tenantId: string,
  bookId: string,
): Promise<Recipient[]> {
  const interestKeys = await bookInterestKeys(tenantId, bookId);

  // Sem tags suficientes no livro → não dispara (evita blast genérico)
  if (interestKeys.length < MIN_INTEREST_TAG_OVERLAP) {
    return [];
  }

  const bookKeySet = new Set(interestKeys);

  const rows = await db
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

  const genericTagIds: string[] = [];
  const byClient = new Map<
    string,
    { id: string; name: string; whatsapp: string | null; matched: Set<string> }
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
      matched: new Set<string>(),
    };
    if (r.tag) {
      const t = r.tag.trim().toLowerCase();
      if (t && bookKeySet.has(t)) existing.matched.add(t);
    }
    byClient.set(r.id, existing);
  }

  if (genericTagIds.length) {
    await db
      .delete(clientInterestTags)
      .where(inArray(clientInterestTags.id, [...new Set(genericTagIds)]));
  }

  return [...byClient.values()]
    .filter(
      (c) =>
        c.whatsapp && c.matched.size >= MIN_INTEREST_TAG_OVERLAP,
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      whatsapp: c.whatsapp,
      matched: [...c.matched].slice(0, 6),
    }));
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
      if (!recipients.length) continue;

      const price = Number(job.salePrice).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      for (const c of recipients) {
        const phone = normalizePhone(c.whatsapp || "");
        if (!phone) continue;
        const interests = c.matched.join(", ");
        const text = [
          `*Chegou algo na sua linha*`,
          `*${job.title}*`,
          job.author ? `Autor: ${job.author}` : null,
          `Preço: ${price}`,
          `Combinou com seus interesses: _${interests}_.`,
          ``,
          `Quer reservar? Responda *reservar* ou peça *indicações*.`,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          await sendTextMessage(cfg, conn.instanceName, phone, text);
          await setSuggestedBooks(job.tenantId, phone, [job.bookId]);
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
