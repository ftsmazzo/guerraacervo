export type BillingProvider = "efi" | "stripe" | "unknown";

export function billingProviderFromSettings(
  settings: Record<string, unknown> | null | undefined,
): BillingProvider {
  const raw = settings?.billingProvider;
  if (raw === "efi") return "efi";
  if (raw === "stripe") return "stripe";
  return "unknown";
}

export function efiPaidAtFromSettings(
  settings: Record<string, unknown> | null | undefined,
): string | null {
  const v = settings?.efiPaidAt;
  return typeof v === "string" ? v : null;
}
