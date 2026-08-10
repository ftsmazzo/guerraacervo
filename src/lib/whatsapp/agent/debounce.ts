import { getRedis } from "@/lib/redis";

const DEBOUNCE_MS = 3000;

/** Retorna true se a mensagem deve ser processada (primeira no intervalo). */
export async function shouldProcessMessage(
  tenantId: string,
  phone: string,
): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const key = `ga:wa:debounce:${tenantId}:${phone}`;
    const ok = await redis.set(key, "1", "PX", DEBOUNCE_MS, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}

export async function setSuggestedBooks(
  tenantId: string,
  phone: string,
  bookIds: string[],
) {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const key = `ga:wa:suggest:${tenantId}:${phone}`;
    await redis.set(key, JSON.stringify(bookIds), "EX", 60 * 30);
  } catch {
    // ignore
  }
}

export async function getSuggestedBooks(
  tenantId: string,
  phone: string,
): Promise<string[]> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const key = `ga:wa:suggest:${tenantId}:${phone}`;
    const raw = await redis.get(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
