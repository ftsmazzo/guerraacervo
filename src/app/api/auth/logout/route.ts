import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  await clearSessionCookie();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}
