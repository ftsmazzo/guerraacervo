export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  appPublicUrl: string;
};

export function resolveEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || apiKey,
    appPublicUrl:
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "https://guerraacervo-app.kxryyk.easypanel.host",
  };
}

export function instanceNameForSlug(slug: string) {
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `ga-${clean || "tenant"}`;
}

async function evoFetch(
  cfg: EvolutionConfig,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.apiKey,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : text || res.statusText;
    throw new Error(`Evolution ${res.status}: ${msg}`);
  }
  return data;
}

export async function createInstance(cfg: EvolutionConfig, instance: string) {
  return evoFetch(cfg, "/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
}

export async function connectInstance(cfg: EvolutionConfig, instance: string) {
  return evoFetch(cfg, `/instance/connect/${encodeURIComponent(instance)}`, {
    method: "GET",
  });
}

export async function connectionState(cfg: EvolutionConfig, instance: string) {
  return evoFetch(
    cfg,
    `/instance/connectionState/${encodeURIComponent(instance)}`,
    { method: "GET" },
  ) as Promise<{
    instance?: { instanceName?: string; state?: string };
    state?: string;
  }>;
}

export async function logoutInstance(cfg: EvolutionConfig, instance: string) {
  return evoFetch(cfg, `/instance/logout/${encodeURIComponent(instance)}`, {
    method: "DELETE",
  });
}

export async function deleteInstance(cfg: EvolutionConfig, instance: string) {
  return evoFetch(cfg, `/instance/delete/${encodeURIComponent(instance)}`, {
    method: "DELETE",
  });
}

export async function setInstanceWebhook(
  cfg: EvolutionConfig,
  instance: string,
) {
  const url = `${cfg.appPublicUrl}/api/whatsapp/webhook?secret=${encodeURIComponent(cfg.webhookSecret)}`;
  return evoFetch(cfg, `/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          "MESSAGES_UPSERT",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
        ],
      },
    }),
  });
}

export async function sendTextMessage(
  cfg: EvolutionConfig,
  instance: string,
  number: string,
  text: string,
) {
  const digits = number.replace(/\D/g, "");
  return evoFetch(cfg, `/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      number: digits,
      text,
    }),
  });
}

export function extractQrBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.base64 === "string") return p.base64;
  if (typeof p.qrcode === "object" && p.qrcode) {
    const q = p.qrcode as Record<string, unknown>;
    if (typeof q.base64 === "string") return q.base64;
  }
  if (typeof p.qrcode === "string") return p.qrcode;
  return null;
}

export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}
