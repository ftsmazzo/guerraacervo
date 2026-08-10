import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error" | "skip"> = {
    app: "ok",
    postgres: "error",
    redis: "error",
  };

  try {
    await db.execute(sql`select 1`);
    checks.postgres = "ok";
  } catch {
    checks.postgres = "error";
  }

  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    const pong = await redis.ping();
    checks.redis = pong === "PONG" ? "ok" : "error";
  } catch {
    checks.redis = "error";
  }

  const healthy = checks.postgres === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "guerraacervo-saas",
      checks,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
