import { readFileSync } from "node:fs";
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

function efiCertBase64(): string | null {
  const fromFile = process.env.EFI_CERT_P12_FILE?.trim();
  if (fromFile) {
    try {
      const raw = readFileSync(fromFile, "utf8").trim();
      if (raw) return raw;
    } catch {
      return null;
    }
  }
  return process.env.EFI_CERT_P12_BASE64?.trim() || null;
}

export function efiConfigured() {
  return Boolean(
    process.env.EFI_CLIENT_ID?.trim() &&
      process.env.EFI_CLIENT_SECRET?.trim() &&
      efiCertBase64() &&
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
  const raw = efiCertBase64()!;
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
    "https://prismabook.com.br"
  ).replace(/\/$/, "");
  return `${base}/api/efi/webhook`;
}
