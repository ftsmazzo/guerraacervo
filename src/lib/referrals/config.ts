/**
 * Tabela de prêmios de indicação — placeholders até fechar com o Renato.
 * Só altera valores aqui; o motor em grant.ts lê esta config.
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

export type ReferralRewardConfig = {
  userRefersBusiness: ReferralRewardRule;
  businessRefersUser: ReferralRewardRule;
  businessRefersBusiness: ReferralRewardRule;
  userRefersUser: ReferralRewardRule;
};

export const REFERRAL_REWARDS: ReferralRewardConfig = {
  // Ex.: 4,99 indica sebo 249,90 → floor(249.9/4.99)=50 → teto 12 meses
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
