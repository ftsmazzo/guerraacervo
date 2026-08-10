import { getRedis } from "@/lib/redis";
import {
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";
import {
  getWhatsappConnection,
  listOptInClientsWithWhatsapp,
} from "@/lib/whatsapp/queries";

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
    // fire-and-forget drain
    void drainNotifyQueue(8);
  } catch (e) {
    console.warn("[whatsapp] enqueue falhou:", e);
  }
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
      if (!conn || conn.status !== "open") {
        // requeue lightly? drop — cadastro não quebra
        continue;
      }

      const recipients = await listOptInClientsWithWhatsapp(job.tenantId);
      const price = Number(job.salePrice).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const text = [
        `📚 *Novo no acervo!*`,
        `*${job.title}*`,
        job.author ? `Autor: ${job.author}` : null,
        `Preço: ${price}`,
        ``,
        `Responda esta conversa se quiser reservar 😊`,
      ]
        .filter(Boolean)
        .join("\n");

      for (const c of recipients) {
        if (!c.whatsapp) continue;
        try {
          await sendTextMessage(
            cfg,
            conn.instanceName,
            c.whatsapp,
            text,
          );
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
