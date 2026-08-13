import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  await db
    .update(tenants)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(tenants.id, ctx.tenant.id));

  return NextResponse.json({ ok: true });
}
