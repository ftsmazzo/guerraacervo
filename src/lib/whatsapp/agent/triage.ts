import { getRedis } from "@/lib/redis";
import { searchCatalogForAgent } from "@/lib/whatsapp/agent/search";
import type { EvolutionConfig } from "@/lib/whatsapp/evolution";
import { sendTextMessage } from "@/lib/whatsapp/evolution";

export type WaLane = "awaiting" | "buy" | "catalog";

const LANE_TTL_SEC = 60 * 60 * 6;

function laneKey(tenantId: string, phone: string) {
  return `ga:wa:lane:${tenantId}:${phone}`;
}

async function redisReady() {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  return redis;
}

export async function getWaLane(
  tenantId: string,
  phone: string,
): Promise<WaLane | null> {
  try {
    const redis = await redisReady();
    const raw = await redis.get(laneKey(tenantId, phone));
    if (raw === "awaiting" || raw === "buy" || raw === "catalog") return raw;
    return null;
  } catch {
    return null;
  }
}

export async function setWaLane(
  tenantId: string,
  phone: string,
  lane: WaLane,
) {
  try {
    const redis = await redisReady();
    await redis.set(laneKey(tenantId, phone), lane, "EX", LANE_TTL_SEC);
  } catch {
    /* ignore */
  }
}

export function triageMenuText(seboName: string) {
  return (
    `Oi! Aqui é o *${seboName}*. Me diz o que você precisa:\n\n` +
    `*1* · Comprar um dos nossos livros\n` +
    `*2* · Ver o catálogo / acervo\n` +
    `*3* · Vender ou trocar o seu livro\n\n` +
    `Pode responder com o número ou a frase.`
  );
}

export function parseTriageChoice(
  text: string,
): "sell" | "buy" | "catalog" | null {
  const t = text.toLowerCase().trim();
  if (
    /^(3|três|tres)([.!)])?$/.test(t) ||
    /\b(vender|vendo|trocar|troca)\b/.test(t) ||
    /quero vender|vender (o )?meu livro|trazer (o )?livro/.test(t)
  ) {
    return "sell";
  }
  if (
    /^(2|dois)([.!)])?$/.test(t) ||
    /\bcat[aá]logo\b/.test(t) ||
    /\bacervo\b/.test(t) ||
    /ver (os )?livros|lista de livros/.test(t)
  ) {
    return "catalog";
  }
  if (
    /^(1|um)([.!)])?$/.test(t) ||
    /\bcomprar\b/.test(t) ||
    /quero (um )?livro|quero comprar/.test(t)
  ) {
    return "buy";
  }
  return null;
}

function money(v: string | number) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Busca no acervo para número que ainda não é cliente — sem reserva. */
export async function replyGuestCatalog(opts: {
  cfg: EvolutionConfig;
  instanceName: string;
  tenantId: string;
  phone: string;
  query: string;
}) {
  const q = opts.query.trim();
  const hits = q
    ? await searchCatalogForAgent({
        tenantId: opts.tenantId,
        query: q,
        limit: 3,
      })
    : await searchCatalogForAgent({
        tenantId: opts.tenantId,
        limit: 3,
      });

  if (!hits.length) {
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      q
        ? `Não achei *${q}* na prateleira agora. Manda outro autor ou título.\nReserva só depois do cadastro no sebo.`
        : "Me fala um autor, um título ou um tema que eu olho no acervo.\nReserva só depois do cadastro no sebo.",
    );
    return;
  }

  const list = hits
    .map((h, i) => {
      return (
        `*${i + 1}. ${h.title}*` +
        (h.author ? ` — ${h.author}` : "") +
        `\n${money(h.salePrice)} · ${h.condition}`
      );
    })
    .join("\n\n");

  await sendTextMessage(
    opts.cfg,
    opts.instanceName,
    opts.phone,
    `No acervo agora:\n\n${list}\n\nQuer outro autor/tema, é só mandar. Pra reservar, o cadastro começa depois da compra no balcão.`,
  );
}

export function looksLikeCatalogQuery(text: string) {
  const t = text.trim();
  if (t.length >= 12) return true;
  return /autor|t[ií]tulo|livro|tem |procuro|quero/.test(t.toLowerCase());
}
