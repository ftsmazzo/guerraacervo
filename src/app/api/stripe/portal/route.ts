import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { appPublicUrl, getStripe } from "@/lib/stripe/client";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe não configurado." },
      { status: 503 },
    );
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);

  if (!tenant?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Assinatura Stripe não encontrada nesta conta." },
      { status: 400 },
    );
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appPublicUrl()}/painel`,
  });

  return NextResponse.json({ url: portal.url });
}
