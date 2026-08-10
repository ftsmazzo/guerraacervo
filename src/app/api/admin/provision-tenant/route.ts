import { NextResponse } from "next/server";
import { createTenantAccount } from "@/app/admin/actions";
import { getAuthContext } from "@/lib/auth/context";

export const runtime = "nodejs";

/** Provisiona sebo via API (sessão de platform admin). */
export async function POST(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const res = await createTenantAccount({
    tenantName: String(body.tenantName || ""),
    slug: body.slug ? String(body.slug) : undefined,
    ownerName: String(body.ownerName || ""),
    ownerEmail: String(body.ownerEmail || ""),
    password: body.password ? String(body.password) : undefined,
    planCode: body.planCode ? String(body.planCode) : undefined,
    trialDays: body.trialDays != null ? Number(body.trialDays) : undefined,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json(res);
}
