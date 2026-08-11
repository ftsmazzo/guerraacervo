import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push/subscriptions";
import type { PushSubscriptionJSON } from "@/lib/push/types";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    subscription?: PushSubscriptionJSON;
  } | null;
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: "Subscription inválida." },
      { status: 400 },
    );
  }

  await savePushSubscription(ctx.tenant.id, ctx.user.id, sub);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  await removePushSubscription(ctx.tenant.id, ctx.user.id);
  return NextResponse.json({ ok: true });
}
