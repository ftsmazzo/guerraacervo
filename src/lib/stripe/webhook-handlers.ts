import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { notifyNewAccount } from "@/lib/signup/notify";
import {
  deleteSignupDraft,
  getSignupDraft,
} from "@/lib/signup/pending";
import {
  planCodeFromPriceId,
  STRIPE_TRIAL_DAYS,
} from "@/lib/stripe/client";
import { provisionTenantAccount } from "@/lib/tenants/provision";

function mapSubStatus(
  status: Stripe.Subscription.Status,
): "trialing" | "active" | "past_due" | "canceled" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "canceled";
}

function trialEndsFromSubscription(sub: Stripe.Subscription): Date | null {
  if (sub.trial_end) return new Date(sub.trial_end * 1000);
  if (sub.status === "trialing") {
    const d = new Date();
    d.setDate(d.getDate() + STRIPE_TRIAL_DAYS);
    return d;
  }
  return null;
}

async function findTenantByStripe(opts: {
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  if (opts.subscriptionId) {
    const [bySub] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.stripeSubscriptionId, opts.subscriptionId))
      .limit(1);
    if (bySub) return bySub;
  }
  if (opts.customerId) {
    const [byCust] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.stripeCustomerId, opts.customerId))
      .limit(1);
    if (byCust) return byCust;
  }
  return null;
}

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "subscription") return;

  const draftId = session.metadata?.draftId;
  if (!draftId) {
    console.warn("[stripe] checkout sem draftId", session.id);
    return;
  }

  const draft = await getSignupDraft(draftId);
  if (!draft) {
    console.warn("[stripe] draft não encontrado", draftId);
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  const existing = await findTenantByStripe({
    customerId,
    subscriptionId,
  });
  if (existing) {
    await deleteSignupDraft(draftId);
    return;
  }

  const result = await provisionTenantAccount({
    tenantName: draft.tenantName,
    slug: draft.slug,
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    passwordHash: draft.passwordHash,
    ownerWhatsapp: draft.ownerWhatsapp,
    planCode: draft.planCode,
    trialDays: STRIPE_TRIAL_DAYS,
    status: "trialing",
    stripeCustomerId: customerId || null,
    stripeSubscriptionId: subscriptionId || null,
  });

  if (!result.ok) {
    console.error("[stripe] provision falhou", result.error, session.id);
    return;
  }

  await deleteSignupDraft(draftId);
  await notifyNewAccount({
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    ownerWhatsapp: draft.ownerWhatsapp,
    tenantName: draft.tenantName,
    trialDays: STRIPE_TRIAL_DAYS,
  });
}

export async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const tenant = await findTenantByStripe({
    customerId,
    subscriptionId: sub.id,
  });
  if (!tenant) return;

  const priceId = sub.items.data[0]?.price?.id;
  const planCode = priceId
    ? planCodeFromPriceId(priceId) || tenant.planCode
    : tenant.planCode;
  const status = mapSubStatus(sub.status);

  await db
    .update(tenants)
    .set({
      status,
      planCode,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      trialEndsAt: trialEndsFromSubscription(sub),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));
}

export async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const tenant = await findTenantByStripe({
    customerId,
    subscriptionId: sub.id,
  });
  if (!tenant) return;

  await db
    .update(tenants)
    .set({
      status: "canceled",
      stripeSubscriptionId: sub.id,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;
  const tenant = await findTenantByStripe({ customerId });
  if (!tenant) return;

  await db
    .update(tenants)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));
}
