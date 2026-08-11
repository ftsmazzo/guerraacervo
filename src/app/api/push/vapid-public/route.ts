import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push/send";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: "VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY)." },
      { status: 503 },
    );
  }
  return NextResponse.json({ publicKey });
}
