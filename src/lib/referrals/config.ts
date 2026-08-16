/**
 * Tabela de prêmios de indicação (defaults).
 * O admin altera em /admin/indicacoes; o que vale em produção
 * está em platform_settings.referral_rewards.
 */
export type ReferralRewardRule =
  | {
      type: "months";
      formula: "floor_ratio";
      capMonths: number;
    }
  | {
      type: "brl";
      equalToReferredMonthly: true;
      stackUntilFree: boolean;
    };

export type ReferralRewardScenario =
  | "userRefersBusiness"
  | "businessRefersUser"
  | "businessRefersBusiness"
  | "userRefersUser";

export type ReferralRewardConfig = Record<
  ReferralRewardScenario,
  ReferralRewardRule
>;

export const REFERRAL_SCENARIOS: {
  key: ReferralRewardScenario;
  label: string;
  hint: string;
}[] = [
  {
    key: "userRefersBusiness",
    label: "Leitor indica sebo",
    hint: "Ex.: plano de R$ 4,99 indica sebo de R$ 249,90 → meses = piso da divisão, limitado ao teto.",
  },
  {
    key: "businessRefersUser",
    label: "Sebo indica leitor",
    hint: "Crédito em R$ igual à mensalidade de quem pagou, acumulando até zerar a fatura.",
  },
  {
    key: "businessRefersBusiness",
    label: "Sebo indica sebo",
    hint: "Crédito em R$ igual à mensalidade do sebo indicado.",
  },
  {
    key: "userRefersUser",
    label: "Leitor indica leitor",
    hint: "Meses grátis = piso (preço do indicado ÷ preço de quem indicou), limitado ao teto.",
  },
];

export const REFERRAL_REWARDS: ReferralRewardConfig = {
  userRefersBusiness: {
    type: "months",
    formula: "floor_ratio",
    capMonths: 12,
  },
  businessRefersUser: {
    type: "brl",
    equalToReferredMonthly: true,
    stackUntilFree: true,
  },
  businessRefersBusiness: {
    type: "brl",
    equalToReferredMonthly: true,
    stackUntilFree: true,
  },
  userRefersUser: {
    type: "months",
    formula: "floor_ratio",
    capMonths: 1,
  },
};

export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_COOKIE = "pb_ref";
export const REFERRAL_SETTINGS_KEY = "referral_rewards";

export function parseRewardRule(raw: unknown): ReferralRewardRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rule = raw as Record<string, unknown>;
  if (rule.type === "brl") {
    return {
      type: "brl",
      equalToReferredMonthly: true,
      stackUntilFree: rule.stackUntilFree !== false,
    };
  }
  if (rule.type === "months") {
    const cap = Math.floor(Number(rule.capMonths));
    return {
      type: "months",
      formula: "floor_ratio",
      capMonths: Number.isFinite(cap) ? Math.max(1, Math.min(60, cap)) : 1,
    };
  }
  return null;
}

export function parseRewardConfig(raw: unknown): ReferralRewardConfig {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const next = { ...REFERRAL_REWARDS };
  for (const { key } of REFERRAL_SCENARIOS) {
    const parsed = parseRewardRule(src[key]);
    if (parsed) next[key] = parsed;
  }
  return next;
}
