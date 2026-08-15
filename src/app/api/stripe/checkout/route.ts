import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  getSignupDraft,
  isDraftOtpVerified,
} from "@/lib/signup/pending";
import {
  appPublicUrl,
  getStripe,
  priceIdForPlan,
  STRIPE_TRIAL_DAYS,
} from "@/lib/stripe/client";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe não configurado (STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    draftId?: string;
  } | null;
  const draftId = body?.draftId?.trim();
  if (!draftId) {
    return NextResponse.json({ error: "draftId obrigatório." }, { status: 400 });
  }

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
    branding_settings: {
      display_name: "PrismaBook",
      background_color: "#f6f8fb",
      button_color: "#1d5fa8",
      border_style: "rounded",
      font_family: "inter",
    },
    subscription_data: {
      trial_period_days: STRIPE_TRIAL_DAYS,
      metadata: {
        draftId,
        planCode: draft.planCode,
        tenantSlug: draft.slug,
        ownerEmail: draft.ownerEmail,
      },
    },
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
