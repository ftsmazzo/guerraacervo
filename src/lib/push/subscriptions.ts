import type { PushSubscriptionJSON } from "./types";
import { getRedis } from "@/lib/redis";

function subsKey(tenantId: string) {
  return `ga:tenant:${tenantId}:push_subs`;
}

async function redisReady() {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  return redis;
}

export async function savePushSubscription(
  tenantId: string,
  userId: string,
  sub: PushSubscriptionJSON,
) {
  if (!sub.endpoint) throw new Error("Subscription sem endpoint.");
  const redis = await redisReady();
  const key = subsKey(tenantId);
  const existing = await redis.hgetall(key);
  // remove mesma endpoint de outros users do tenant
  for (const [uid, raw] of Object.entries(existing)) {
    try {
      const parsed = JSON.parse(raw) as PushSubscriptionJSON;
      if (parsed.endpoint === sub.endpoint && uid !== userId) {
        await redis.hdel(key, uid);
      }
    } catch {
      // ignore
    }
  }
  await redis.hset(key, userId, JSON.stringify(sub));
  await redis.expire(key, 60 * 60 * 24 * 180);
}

export async function removePushSubscription(
  tenantId: string,
  userId: string,
) {
  const redis = await redisReady();
  await redis.hdel(subsKey(tenantId), userId);
}

export async function listPushSubscriptions(
  tenantId: string,
): Promise<PushSubscriptionJSON[]> {
  try {
    const redis = await redisReady();
    const all = await redis.hgetall(subsKey(tenantId));
    return Object.values(all)
      .map((raw) => {
        try {
          return JSON.parse(raw) as PushSubscriptionJSON;
        } catch {
          return null;
        }
      })
      .filter((s): s is PushSubscriptionJSON => Boolean(s?.endpoint));
  } catch {
    return [];
  }
}
