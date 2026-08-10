import { randomBytes } from "crypto";
import { getRedis } from "@/lib/redis";

export const SCAN_SESSION_TTL_SEC = 300;
export const SCAN_RESULT_TTL_SEC = 60;
export const SCAN_PHOTO_MAX_CHARS = 900_000;

export type ScanSessionMeta = {
  tenantId: string;
  userId: string;
  createdAt: number;
};

export type ScanResult =
  | { type: "isbn"; code: string; at: number }
  | { type: "photo"; imageBase64: string; at: number };

function sessKey(token: string) {
  return `scan:sess:${token}`;
}

function resultKey(token: string) {
  return `scan:result:${token}`;
}

export function newScanToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function createScanSession(
  meta: Omit<ScanSessionMeta, "createdAt">,
): Promise<{ token: string; expiresAt: number }> {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect();
  const token = newScanToken();
  const createdAt = Date.now();
  const payload: ScanSessionMeta = { ...meta, createdAt };
  await redis.set(
    sessKey(token),
    JSON.stringify(payload),
    "EX",
    SCAN_SESSION_TTL_SEC,
  );
  return { token, expiresAt: createdAt + SCAN_SESSION_TTL_SEC * 1000 };
}

export async function getScanSession(
  token: string,
): Promise<ScanSessionMeta | null> {
  if (!token || token.length < 16) return null;
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect();
  const raw = await redis.get(sessKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScanSessionMeta;
  } catch {
    return null;
  }
}

export async function putScanResult(
  token: string,
  result: ScanResult,
): Promise<boolean> {
  const sess = await getScanSession(token);
  if (!sess) return false;
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect();
  await redis.set(
    resultKey(token),
    JSON.stringify(result),
    "EX",
    SCAN_RESULT_TTL_SEC,
  );
  return true;
}

/** Consome o resultado uma vez (GETDEL). */
export async function takeScanResult(
  token: string,
): Promise<ScanResult | null> {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect();
  const key = resultKey(token);
  const raw =
    typeof redis.getdel === "function"
      ? await redis.getdel(key)
      : await (async () => {
          const v = await redis.get(key);
          if (v) await redis.del(key);
          return v;
        })();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScanResult;
  } catch {
    return null;
  }
}

export function appPublicOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}
