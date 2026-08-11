import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { dismissTenantAlert } from "@/lib/tenant-alerts";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    alertId?: string;
  } | null;
  const alertId = body?.alertId?.trim();
  if (!alertId) {
    return NextResponse.json({ error: "alertId obrigatório." }, { status: 400 });
  }

  await dismissTenantAlert(ctx.tenant.id, alertId);
  return NextResponse.json({ ok: true });
}
