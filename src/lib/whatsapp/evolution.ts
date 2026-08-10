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

/** Garante webhook ativo (após QR / troca de número / reconnect). */
export async function ensureInstanceWebhook(
  cfg: EvolutionConfig,
  instance: string,
): Promise<boolean> {
  try {
    await setInstanceWebhook(cfg, instance);
    return true;
  } catch (e) {
    console.warn("[whatsapp] ensure webhook falhou", instance, e);
    return false;
  }
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

  const fromObj = (obj: Record<string, unknown> | null | undefined) => {
    if (!obj) return null;
    if (typeof obj.base64 === "string" && obj.base64.length > 20) {
      return obj.base64;
    }
    return null;
  };

  const direct = fromObj(p);
  if (direct) return direct;

  if (typeof p.qrcode === "object" && p.qrcode) {
    const nested = fromObj(p.qrcode as Record<string, unknown>);
    if (nested) return nested;
  }

  if (typeof p.qrcode === "string" && p.qrcode.length > 20) {
    return p.qrcode;
  }

  // alguns payloads aninham em data
  if (typeof p.data === "object" && p.data) {
    const nested = extractQrBase64(p.data);
    if (nested) return nested;
  }

  return null;
}

/** Aguarda o Baileys publicar o QR (count > 0 / base64). */
export async function waitForQr(
  cfg: EvolutionConfig,
  instance: string,
  attempts = 10,
  delayMs = 2000,
): Promise<{ qr: string | null; raw: unknown }> {
  let last: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await connectInstance(cfg, instance);
      const qr = extractQrBase64(last);
      if (qr) return { qr, raw: last };
      const count =
        typeof last === "object" &&
        last &&
        "count" in last &&
        typeof (last as { count: unknown }).count === "number"
          ? (last as { count: number }).count
          : typeof last === "object" &&
              last &&
              "qrcode" in last &&
              typeof (last as { qrcode: { count?: number } }).qrcode ===
                "object"
            ? (last as { qrcode: { count?: number } }).qrcode?.count
            : null;
      if (typeof count === "number" && count > 0) {
        const again = extractQrBase64(last);
        if (again) return { qr: again, raw: last };
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { qr: null, raw: last };
}

export function normalizePhone(raw: string): string {
  // Aceita JID completo (ex.: 5511...@s.whatsapp.net) ou só dígitos
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  const d = local.replace(/\D/g, "");
  if (!d) return "";
  // LIDs numéricos longos (>13) não são telefone — rejeita
  if (d.length > 13) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}
