import { getRedis } from "@/lib/redis";

const DEBOUNCE_MS = 900;

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
    await redis.set(key, JSON.stringify(bookIds), "EX", 60 * 60);
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

/** Pedido de busca capturado no meio do onboarding (ex.: CS Lewis). */
export async function setPendingSearch(
  tenantId: string,
  phone: string,
  query: string,
) {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const key = `ga:wa:pending-search:${tenantId}:${phone}`;
    await redis.set(key, query.trim(), "EX", 60 * 60 * 6);
  } catch {
    // ignore
  }
}

export async function takePendingSearch(
  tenantId: string,
  phone: string,
): Promise<string | null> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const key = `ga:wa:pending-search:${tenantId}:${phone}`;
    const raw = await redis.get(key);
    if (raw) await redis.del(key);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}
