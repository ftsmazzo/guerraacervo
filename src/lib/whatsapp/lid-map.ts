import { getRedis } from "@/lib/redis";

/** Mapeia WhatsApp LID (@lid) → telefone real (@s.whatsapp.net). */
export async function rememberLidPhone(lidJid: string, phoneJid: string) {
  const lid = lidJid.includes("@") ? lidJid.split("@")[0] : lidJid;
  const phone = phoneJid.includes("@") ? phoneJid.split("@")[0] : phoneJid;
  if (!lid || !phone || lid.length < 5) return;
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    await redis.set(`ga:wa:lid:${lid}`, phone, "EX", 60 * 60 * 24 * 90);
  } catch {
    // ignore
  }
}

export async function resolvePhoneFromLid(lidJid: string): Promise<string | null> {
  const lid = lidJid.includes("@") ? lidJid.split("@")[0] : lidJid;
  if (!lid) return null;
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    const phone = await redis.get(`ga:wa:lid:${lid}`);
    return phone || null;
  } catch {
    return null;
  }
}
