import { NextResponse } from "next/server";
import { sessionForUser } from "@/lib/auth/authenticate";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { getPlan, planIsFree } from "@/lib/plans";
import { attachReferralOnSignup } from "@/lib/referrals/attach";
import { notifyNewAccount } from "@/lib/signup/notify";
import {
  consumeOtpCode,
  deleteSignupDraft,
  getSignupDraft,
  markDraftOtpVerified,
} from "@/lib/signup/pending";
import { STRIPE_TRIAL_DAYS } from "@/lib/stripe/client";
import { provisionTenantAccount } from "@/lib/tenants/provision";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    draftId?: string;
    code?: string;
  } | null;

  const draftId = body?.draftId?.trim();
  const code = body?.code?.trim();
  if (!draftId || !code) {
    return NextResponse.json(
      { error: "draftId e código obrigatórios." },
      { status: 400 },
    );
  }

  const draft = await getSignupDraft(draftId);
  if (!draft) {
    return NextResponse.json(
      { error: "Cadastro expirado. Recomece." },
      { status: 400 },
    );
  }

  const ok = await consumeOtpCode(draft.ownerWhatsapp, code);
  if (!ok) {
    return NextResponse.json(
      { error: "Código inválido ou expirado." },
      { status: 400 },
    );
  }

  await markDraftOtpVerified(draftId);

  const plan = getPlan(draft.planCode);
  const free = planIsFree(draft.planCode);
  const trialDays = free
    ? 0
    : (plan?.trialDays ?? STRIPE_TRIAL_DAYS);

  const result = await provisionTenantAccount({
    tenantName: draft.tenantName,
    slug: draft.slug,
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    passwordHash: draft.passwordHash,
    ownerWhatsapp: draft.ownerWhatsapp,
    planCode: draft.planCode,
    trialDays: trialDays || STRIPE_TRIAL_DAYS,
    status: free ? "active" : "trialing",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await attachReferralOnSignup({
    referredTenantId: result.tenantId,
    code: draft.referralCode,
  });

  const session = await sessionForUser(result.userId);
  if (session) {
    const token = await signSession(session);
    await setSessionCookie(token);
  }

  await deleteSignupDraft(draftId);
  await notifyNewAccount({
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    ownerWhatsapp: draft.ownerWhatsapp,
    tenantName: draft.tenantName,
    trialDays,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    redirect: "/painel",
    slug: result.slug,
  });
}
