import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import {
  appPublicOrigin,
  createScanSession,
} from "@/lib/scan-sessions";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { token, expiresAt } = await createScanSession({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
    });
    const scanUrl = `${appPublicOrigin()}/m/scan/${token}`;
    return NextResponse.json({ token, scanUrl, expiresAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Falha ao criar sessão de scan: ${msg}` },
      { status: 500 },
    );
  }
}
