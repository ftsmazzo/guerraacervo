import { getRedis } from "@/lib/redis";

function txKey(txid: string) {
  return `ga:efi:txid:${txid}`;
}

function webhookFlag() {
  return "ga:efi:webhook:configured";
}

export async function rememberEfiDraft(txid: string, draftId: string) {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(txKey(txid), draftId, "EX", 60 * 60 * 24);
}

export async function draftIdForTxid(txid: string): Promise<string | null> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    return (await redis.get(txKey(txid))) || null;
  } catch {
    return null;
  }
}

export async function efiWebhookReady(): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    return (await redis.get(webhookFlag())) === "1";
  } catch {
    return false;
  }
}

export async function markEfiWebhookReady() {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(webhookFlag(), "1", "EX", 60 * 60 * 24 * 30);
}
