import Stripe from "stripe";

export const STRIPE_TRIAL_DAYS = 14;

export const BUSINESS_PLAN_CODES = [
  "business_essencial",
  "business_profissional",
  "business_master",
] as const;

export type BusinessPlanCode = (typeof BUSINESS_PLAN_CODES)[number];

export const PERSONAL_PAID_PLAN_CODES = [
  "personal_biblioteca",
  "personal_colecionador",
  "personal_premium",
] as const;

export type PersonalPaidPlanCode = (typeof PERSONAL_PAID_PLAN_CODES)[number];

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
  });
}

export function appPublicUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://prismabook.com.br"
  );
}

export function priceIdForPlan(planCode: string): string | null {
  const map: Record<string, string | undefined> = {
    business_essencial: process.env.STRIPE_PRICE_ESSENCIAL,
    business_profissional: process.env.STRIPE_PRICE_PROFISSIONAL,
    business_master: process.env.STRIPE_PRICE_MASTER,
    personal_biblioteca: process.env.STRIPE_PRICE_BIBLIOTECA,
    personal_colecionador: process.env.STRIPE_PRICE_COLECIONADOR,
    personal_premium: process.env.STRIPE_PRICE_PREMIUM,
  };
  const id = map[planCode]?.trim();
  return id || null;
}

export function planCodeFromPriceId(priceId: string): string | null {
  const pairs: Array<[string, string | undefined]> = [
    ["business_essencial", process.env.STRIPE_PRICE_ESSENCIAL],
    ["business_profissional", process.env.STRIPE_PRICE_PROFISSIONAL],
    ["business_master", process.env.STRIPE_PRICE_MASTER],
    ["personal_biblioteca", process.env.STRIPE_PRICE_BIBLIOTECA],
    ["personal_colecionador", process.env.STRIPE_PRICE_COLECIONADOR],
    ["personal_premium", process.env.STRIPE_PRICE_PREMIUM],
  ];
  for (const [code, id] of pairs) {
    if (id?.trim() === priceId) return code;
  }
  return null;
}

export function isBusinessPlanCode(code: string): code is BusinessPlanCode {
  return (BUSINESS_PLAN_CODES as readonly string[]).includes(code);
}
