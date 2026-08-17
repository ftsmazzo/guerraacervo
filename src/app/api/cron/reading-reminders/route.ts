import { NextResponse } from "next/server";
import { runReadingReminders } from "@/lib/reading/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = req.headers.get("x-cron-secret")?.trim() || "";
  const q = new URL(req.url).searchParams.get("secret")?.trim() || "";
  return bearer === secret || header === secret || q === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const result = await runReadingReminders();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
