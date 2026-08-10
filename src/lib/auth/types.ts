export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  planCode: string | null;
  planName: string | null;
  role: string | null;
  tenantStatus: string | null;
  trialEndsAt: string | null;
};

export const SESSION_COOKIE = "ga_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 dias
