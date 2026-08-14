import { getRedis } from "@/lib/redis";

function txKey(txid: string) {
  return `ga:efi:txid:${txid}`;
}

function webhookFlag(url?: string) {
  const base = "ga:efi:webhook:configured";
  if (!url) return base;
  // Inclui a URL para forçar re-registro quando o domínio muda.
  const safe = url.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120);
  return `${base}:${safe}`;
}

export async function rememberEfiDraft(txid: string, draftId: string) {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(txKey(txid), draftId, "EX", 60 * 60 * 24);
}

function tenantTxKey(txid: string) {
  return `ga:efi:tenant:${txid}`;
}

export async function rememberEfiTenant(txid: string, tenantId: string) {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(tenantTxKey(txid), tenantId, "EX", 60 * 60 * 24);
}

export async function tenantIdForTxid(txid: string): Promise<string | null> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    return (await redis.get(tenantTxKey(txid))) || null;
  } catch {
    return null;
  }
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

export async function efiWebhookReady(webhookUrl?: string): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect().catch(() => null);
    return (await redis.get(webhookFlag(webhookUrl))) === "1";
  } catch {
    return false;
  }
}

export async function markEfiWebhookReady(webhookUrl?: string) {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect().catch(() => null);
  await redis.set(webhookFlag(webhookUrl), "1", "EX", 60 * 60 * 24 * 30);
}
