import EfiPay from "sdk-node-apis-efi";

export type EfiCharge = {
  txid?: string;
  status?: string;
  loc?: { id?: number; location?: string };
  pixCopiaECola?: string;
  calendario?: { expiracao?: number };
  valor?: { original?: string };
};

let cached: EfiPay | null = null;

export function efiConfigured() {
  return Boolean(
    process.env.EFI_CLIENT_ID?.trim() &&
      process.env.EFI_CLIENT_SECRET?.trim() &&
      process.env.EFI_CERT_P12_BASE64?.trim() &&
      process.env.EFI_PIX_KEY?.trim(),
  );
}

export async function getEfiPay() {
  if (cached) return cached;
  if (!efiConfigured()) {
    throw new Error(
      "Efí não configurada (Client ID/Secret, certificado e chave Pix).",
    );
  }
  const sandbox = process.env.EFI_SANDBOX !== "false";
  const raw = process.env.EFI_CERT_P12_BASE64!.trim();
  const certificate = raw.replace(/^data:application\/x-pkcs12;base64,/i, "");

  cached = new EfiPay({
    sandbox,
    client_id: process.env.EFI_CLIENT_ID!.trim(),
    client_secret: process.env.EFI_CLIENT_SECRET!.trim(),
    certificate,
    cert_base64: true,
    validateMtls: false,
  });
  return cached;
}

export function efiPixKey() {
  return process.env.EFI_PIX_KEY!.trim();
}

export function efiWebhookUrl() {
  const explicit = process.env.EFI_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://guerraacervo-app.kxryyk.easypanel.host"
  ).replace(/\/$/, "");
  return `${base}/api/efi/webhook`;
}
