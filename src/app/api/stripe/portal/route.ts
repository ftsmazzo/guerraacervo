import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { billingProviderFromSettings } from "@/lib/billing/provider";
import { appPublicUrl, getStripe } from "@/lib/stripe/client";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);

  const billing = billingProviderFromSettings(
    (tenant?.settings || {}) as Record<string, unknown>,
  );

  if (billing === "efi" || !tenant?.stripeCustomerId) {
    return NextResponse.json({ url: "/painel/assinatura" });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ url: "/painel/assinatura" });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appPublicUrl()}/painel/assinatura`,
  });

  return NextResponse.json({ url: portal.url });
}
