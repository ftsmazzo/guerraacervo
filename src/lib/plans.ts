export type Product = "personal" | "business";

export type Entitlement =
  | "catalog"
  | "clients"
  | "orders"
  | "reports_basic"
  | "reports_advanced"
  | "store_whatsapp"
  | "store_pix"
  | "ai_pricing"
  | "ai_suggestions"
  | "export"
  | "stats"
  | "wishlist"
  | "share_collection";

export type PlanDefinition = {
  code: string;
  product: Product;
  name: string;
  priceMonthlyBrl: number | null;
  /** null = ilimitado */
  maxBooks: number | null;
  entitlements: Entitlement[];
  trialDays?: number;
};

/** Planos alinhados ao documento estratégico (ago/2026) + refinamentos SaaS */
export const PLANS: Record<string, PlanDefinition> = {
  // ── Pessoal (roadmap) ─────────────────────────────────────
  personal_free: {
    code: "personal_free",
    product: "personal",
    name: "Grátis",
    priceMonthlyBrl: 0,
    maxBooks: 50,
    entitlements: ["catalog"],
  },
  personal_biblioteca: {
    code: "personal_biblioteca",
    product: "personal",
    name: "Biblioteca",
    priceMonthlyBrl: 4.99,
    maxBooks: 100,
    entitlements: ["catalog", "export"],
  },
  personal_colecionador: {
    code: "personal_colecionador",
    product: "personal",
    name: "Colecionador",
    priceMonthlyBrl: 9.99,
    maxBooks: 500,
    entitlements: ["catalog", "export", "stats", "wishlist", "share_collection"],
  },
  personal_premium: {
    code: "personal_premium",
    product: "personal",
    name: "Premium",
    priceMonthlyBrl: 19.99,
    maxBooks: null,
    entitlements: [
      "catalog",
      "export",
      "stats",
      "wishlist",
      "share_collection",
      "ai_suggestions",
    ],
  },

  // ── Negócio (MVP) ─────────────────────────────────────────
  business_trial: {
    code: "business_trial",
    product: "business",
    name: "Teste",
    priceMonthlyBrl: null,
    maxBooks: null,
    trialDays: 14,
    entitlements: [
      "catalog",
      "clients",
      "orders",
      "reports_basic",
      "reports_advanced",
      "store_whatsapp",
      "store_pix",
      "ai_pricing",
    ],
  },
  business_essencial: {
    code: "business_essencial",
    product: "business",
    name: "Essencial",
    priceMonthlyBrl: 89.9,
    maxBooks: 500,
    trialDays: 14,
    entitlements: ["catalog", "clients", "orders", "reports_basic"],
  },
  business_profissional: {
    code: "business_profissional",
    product: "business",
    name: "Profissional",
    priceMonthlyBrl: 149.9,
    maxBooks: 2000,
    trialDays: 14,
    entitlements: [
      "catalog",
      "clients",
      "orders",
      "reports_basic",
      "reports_advanced",
      "store_whatsapp",
    ],
  },
  business_master: {
    code: "business_master",
    product: "business",
    name: "Master",
    priceMonthlyBrl: 249.9,
    maxBooks: null,
    trialDays: 14,
    entitlements: [
      "catalog",
      "clients",
      "orders",
      "reports_basic",
      "reports_advanced",
      "store_whatsapp",
      "store_pix",
      "ai_pricing",
    ],
  },
};

export function getPlan(code: string): PlanDefinition | undefined {
  return PLANS[code];
}

export function planHas(
  planCode: string,
  entitlement: Entitlement,
): boolean {
  const plan = getPlan(planCode);
  if (!plan) return false;
  return plan.entitlements.includes(entitlement);
}

export function businessPlans() {
  return Object.values(PLANS).filter(
    (p) => p.product === "business" && p.code !== "business_trial",
  );
}

export function personalPlans() {
  return Object.values(PLANS).filter((p) => p.product === "personal");
}
