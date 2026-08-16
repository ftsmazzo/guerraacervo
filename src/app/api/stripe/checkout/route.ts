import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { getPlan, planIsFree } from "@/lib/plans";
import {
  getSignupDraft,
  isDraftOtpVerified,
} from "@/lib/signup/pending";
import {
  appPublicUrl,
  getStripe,
  priceIdForPlan,
} from "@/lib/stripe/client";

const BRANDING = {
  display_name: "PrismaBook",
  background_color: "#f6f8fb",
  button_color: "#1d5fa8",
  border_style: "rounded" as const,
  font_family: "inter" as const,
};

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe não configurado (STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    draftId?: string;
  } | null;

  const draftId = body?.draftId?.trim();
  if (draftId) {
    return checkoutFromDraft(stripe, draftId);
  }

  return checkoutFromSession(stripe);
}

async function checkoutFromSession(stripe: NonNullable<ReturnType<typeof getStripe>>) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant || !ctx.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (planIsFree(ctx.tenant.planCode)) {
    return NextResponse.json(
      { error: "Plano grátis não precisa de checkout." },
      { status: 400 },
    );
  }

  const priceId = priceIdForPlan(ctx.tenant.planCode);
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "Preço Stripe não configurado para este plano. Defina STRIPE_PRICE_* nas envs.",
      },
      { status: 503 },
    );
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);
  if (!tenant) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const base = appPublicUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(tenant.stripeCustomerId
      ? { customer: tenant.stripeCustomerId }
      : { customer_email: ctx.user.email }),
    line_items: [{ price: priceId, quantity: 1 }],
    branding_settings: BRANDING,
    subscription_data: {
      metadata: {
        tenantId: tenant.id,
        planCode: tenant.planCode,
        flow: "convert",
      },
    },
    payment_method_collection: "always",
    success_url: `${base}/painel/assinatura?pago=stripe`,
    cancel_url: `${base}/painel/assinatura?cancel=1`,
    metadata: {
      tenantId: tenant.id,
      planCode: tenant.planCode,
      ownerEmail: ctx.user.email,
      flow: "convert",
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe não retornou URL de checkout." },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: session.url, sessionId: session.id });
}

async function checkoutFromDraft(
  stripe: NonNullable<ReturnType<typeof getStripe>>,
  draftId: string,
) {
  const draft = await getSignupDraft(draftId);
  if (!draft) {
    return NextResponse.json(
      { error: "Cadastro expirado. Recomece o formulário." },
      { status: 400 },
    );
  }
  if (!(await isDraftOtpVerified(draftId))) {
    return NextResponse.json(
      { error: "Confirme o código WhatsApp antes do pagamento." },
      { status: 403 },
    );
  }

  const plan = getPlan(draft.planCode);
  if (!plan || planIsFree(draft.planCode)) {
    return NextResponse.json({ error: "Plano sem cobrança Stripe." }, { status: 400 });
  }

  const priceId = priceIdForPlan(draft.planCode);
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "Preço Stripe não configurado para este plano. Defina STRIPE_PRICE_* nas envs.",
      },
      { status: 503 },
    );
  }

  const [emailTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, draft.ownerEmail))
    .limit(1);
  if (emailTaken) {
    return NextResponse.json(
      { error: "Já existe usuário com este e-mail." },
      { status: 409 },
    );
  }

  const base = appPublicUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: draft.ownerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    branding_settings: BRANDING,
    payment_method_collection: "always",
    success_url: `${base}/cadastro/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/cadastro?plano=${draft.planCode}&cancel=1`,
    metadata: {
      draftId,
      planCode: draft.planCode,
      tenantSlug: draft.slug,
      ownerEmail: draft.ownerEmail,
      ownerWhatsapp: draft.ownerWhatsapp,
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe não retornou URL de checkout." },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: session.url, sessionId: session.id });
}
