import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { getRedis } from "@/lib/redis";
import { sendPushToTenant } from "@/lib/push/send";
import { appPublicUrl } from "@/lib/stripe/client";
import {
  normalizePhone,
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";

export type TenantAlert = {
  id: string;
  type: "reservation";
  orderId: string;
  bookTitle: string;
  clientName: string;
  source: "whatsapp" | "online" | "painel";
  createdAt: number;
};

function alertsKey(tenantId: string) {
  return `ga:tenant:${tenantId}:alerts`;
}

async function redisReady() {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  return redis;
}

export async function pushTenantAlert(
  tenantId: string,
  alert: Omit<TenantAlert, "id" | "createdAt"> & {
    id?: string;
    createdAt?: number;
  },
) {
  const full: TenantAlert = {
    id: alert.id || randomUUID(),
    type: alert.type,
    orderId: alert.orderId,
    bookTitle: alert.bookTitle,
    clientName: alert.clientName,
    source: alert.source,
    createdAt: alert.createdAt || Date.now(),
  };
  try {
    const redis = await redisReady();
    await redis.lpush(alertsKey(tenantId), JSON.stringify(full));
    await redis.ltrim(alertsKey(tenantId), 0, 49);
    await redis.expire(alertsKey(tenantId), 60 * 60 * 24 * 14);
  } catch (e) {
    console.warn("[alerts] push falhou", e);
  }
  return full;
}

export async function listTenantAlerts(
  tenantId: string,
  limit = 8,
): Promise<TenantAlert[]> {
  try {
    const redis = await redisReady();
    const raw = await redis.lrange(alertsKey(tenantId), 0, limit - 1);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as TenantAlert;
        } catch {
          return null;
        }
      })
      .filter((a): a is TenantAlert => Boolean(a));
  } catch {
    return [];
  }
}

export async function dismissTenantAlert(tenantId: string, alertId: string) {
  try {
    const redis = await redisReady();
    const key = alertsKey(tenantId);
    const raw = await redis.lrange(key, 0, 49);
    const keep = raw.filter((r) => {
      try {
        const a = JSON.parse(r) as TenantAlert;
        return a.id !== alertId;
      } catch {
        return true;
      }
    });
    await redis.del(key);
    if (keep.length) {
      await redis.rpush(key, ...keep.reverse());
      await redis.expire(key, 60 * 60 * 24 * 14);
    }
  } catch (e) {
    console.warn("[alerts] dismiss falhou", e);
  }
}

async function resolveSeboNotifyPhones(tenantId: string): Promise<string[]> {
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const settings = (tenant?.settings || {}) as Record<string, unknown>;
  const configured =
    typeof settings.reservationNotifyWhatsapp === "string"
      ? settings.reservationNotifyWhatsapp
      : typeof settings.notifyWhatsapp === "string"
        ? settings.notifyWhatsapp
        : null;

  const phones = new Set<string>();
  if (configured) {
    const p = normalizePhone(configured);
    if (p) phones.add(p);
  }

  const owners = await db
    .select({ whatsapp: users.whatsapp })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")),
    );

  for (const o of owners) {
    if (o.whatsapp) {
      const p = normalizePhone(o.whatsapp);
      if (p) phones.add(p);
    }
  }

  return [...phones];
}

/** Avisa o sebo: banner painel + WhatsApp + Web Push. */
export async function notifySeboReservation(opts: {
  tenantId: string;
  orderId: string;
  bookTitle: string;
  clientName: string;
  source?: "whatsapp" | "online" | "painel";
}) {
  const source = opts.source ?? "whatsapp";
  await pushTenantAlert(opts.tenantId, {
    type: "reservation",
    orderId: opts.orderId,
    bookTitle: opts.bookTitle,
    clientName: opts.clientName,
    source,
  });

  const link = `${appPublicUrl()}/painel/pedidos/${opts.orderId}`;

  void sendPushToTenant(opts.tenantId, {
    title: "Nova reserva — tire da prateleira",
    body: `${opts.bookTitle} · ${opts.clientName}`,
    url: link,
  }).catch((e) => console.warn("[alerts] push", e));

  const cfg = resolveEvolutionConfig();
  const conn = await getWhatsappConnection(opts.tenantId);
  if (!cfg || !conn || conn.status !== "open") return;

  const phones = await resolveSeboNotifyPhones(opts.tenantId);
  if (!phones.length) {
    console.info(
      "[alerts] reserva sem WhatsApp de alerta — banner/push ok",
      opts.orderId,
    );
    return;
  }

  const text = [
    `*Nova reserva* — tire o livro da prateleira`,
    `*${opts.bookTitle}*`,
    `Cliente: ${opts.clientName}`,
    source === "whatsapp" ? `Via agente WhatsApp` : `Via ${source}`,
    ``,
    `Pedido: ${link}`,
  ].join("\n");

  for (const phone of phones) {
    try {
      await sendTextMessage(cfg, conn.instanceName, phone, text);
    } catch (e) {
      console.warn("[alerts] WhatsApp sebo falhou", phone, e);
    }
  }
}
