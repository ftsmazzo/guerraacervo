import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não definida");
    redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  }
  return redis;
}
