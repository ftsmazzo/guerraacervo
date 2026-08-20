import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { getPlan, planIsFree } from "@/lib/plans";
import { allocateUniqueReferralCode } from "@/lib/referrals/codes";
import { STRIPE_TRIAL_DAYS } from "@/lib/stripe/client";

export function slugifyTenant(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export type ProvisionTenantInput = {
  tenantName: string;
  slug?: string;
  ownerName: string;
  ownerEmail: string;
  /** hash pronto OU senha em texto (hash internamente) */
  passwordHash?: string;
  password?: string;
  ownerWhatsapp?: string | null;
  planCode: string;
  trialDays?: number;
  status?: "trialing" | "active";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  settings?: Record<string, unknown>;
};

export type ProvisionTenantResult =
  | {
      ok: true;
      tenantId: string;
      userId: string;
      slug: string;
      email: string;
    }
  | { ok: false; error: string };

/** Provisiona sebo + owner sem exigir admin (Stripe webhook / admin). */
export async function provisionTenantAccount(
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const tenantName = input.tenantName.trim();
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const plan = getPlan(input.planCode);
  if (!plan) return { ok: false, error: "Plano inválido." };
  if (!tenantName) {
    return {
      ok: false,
      error:
        plan.product === "personal"
          ? "Nome da biblioteca obrigatório."
          : plan.product === "library"
            ? "Nome da biblioteca obrigatório."
            : "Nome do sebo obrigatório.",
    };
  }
  if (!ownerName) return { ok: false, error: "Nome do responsável obrigatório." };
  if (!ownerEmail || !ownerEmail.includes("@")) {
    return { ok: false, error: "E-mail inválido." };
  }

  let slug = slugifyTenant(input.slug?.trim() || tenantName);
  if (!slug) return { ok: false, error: "Slug inválido." };
  if (!slug.startsWith("sebo-") && plan.product === "business") {
    slug = `sebo-${slug}`.slice(0, 60);
  }
  if (!slug.startsWith("bib-") && plan.product === "library") {
    slug = `bib-${slug}`.slice(0, 60);
  }

  let passwordHash = input.passwordHash?.trim() || "";
  if (!passwordHash) {
    const password = input.password?.trim();
    if (!password || password.length < 6) {
      return { ok: false, error: "Senha com pelo menos 6 caracteres." };
    }
    passwordHash = await bcrypt.hash(password, 10);
  }

  const [emailTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (emailTaken) {
    return { ok: false, error: "Já existe usuário com este e-mail." };
  }

  const [slugTaken] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (slugTaken) {
    return { ok: false, error: `Slug "${slug}" já está em uso.` };
  }

  const wantsTrial =
    !planIsFree(plan.code) && (input.status ?? "trialing") === "trialing";
  const trialDays = Math.max(
    1,
    Math.min(
      90,
      Math.floor(input.trialDays ?? plan.trialDays ?? STRIPE_TRIAL_DAYS),
    ),
  );
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + trialDays);
  const status = planIsFree(plan.code)
    ? "active"
    : (input.status ?? "trialing");
  const referralCode = await allocateUniqueReferralCode();

  try {
    const [user] = await db
      .insert(users)
      .values({
        email: ownerEmail,
        name: ownerName,
        passwordHash,
        isPlatformAdmin: false,
        whatsapp: input.ownerWhatsapp?.replace(/\D/g, "") || null,
        whatsappVerifiedAt: input.ownerWhatsapp ? new Date() : null,
      })
      .returning();

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: tenantName,
        slug,
        product: plan.product,
        planCode: plan.code,
        status,
        trialEndsAt: wantsTrial ? trialEnds : null,
        storeEnabled:
          plan.product === "business" || plan.product === "library",
        stripeCustomerId: input.stripeCustomerId || null,
        stripeSubscriptionId: input.stripeSubscriptionId || null,
        referralCode,
        settings:
          plan.product === "library"
            ? {
                library: {
                  loanDays: 14,
                  maxOpenLoans: 3,
                  maxRenewals: 2,
                },
                ...(input.settings || {}),
              }
            : input.settings || {},
      })
      .returning();

    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });

    return {
      ok: true,
      tenantId: tenant.id,
      userId: user.id,
      slug: tenant.slug,
      email: ownerEmail,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao criar conta: ${msg}` };
  }
}
