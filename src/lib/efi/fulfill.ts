import { efiPixKey, efiWebhookUrl, getEfiPay } from "@/lib/efi/client";
import {
  draftIdForTxid,
  efiWebhookReady,
  markEfiWebhookReady,
} from "@/lib/efi/pending";
import { notifyNewAccount } from "@/lib/signup/notify";
import {
  deleteSignupDraft,
  getSignupDraft,
} from "@/lib/signup/pending";
import { STRIPE_TRIAL_DAYS } from "@/lib/stripe/client";
import { provisionTenantAccount } from "@/lib/tenants/provision";

export async function ensureEfiWebhook() {
  if (await efiWebhookReady()) return;
  const efi = await getEfiPay();
  await efi.pixConfigWebhook(
    { chave: efiPixKey() },
    { webhookUrl: efiWebhookUrl() },
  );
  await markEfiWebhookReady();
}

export async function fulfillEfiPix(txid: string): Promise<{
  ok: boolean;
  error?: string;
  already?: boolean;
}> {
  const draftId = await draftIdForTxid(txid);
  if (!draftId) return { ok: false, error: "txid sem cadastro pendente." };

  const draft = await getSignupDraft(draftId);
  if (!draft) {
    return { ok: true, already: true };
  }

  const result = await provisionTenantAccount({
    tenantName: draft.tenantName,
    slug: draft.slug,
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    passwordHash: draft.passwordHash,
    ownerWhatsapp: draft.ownerWhatsapp,
    planCode: draft.planCode,
    trialDays: STRIPE_TRIAL_DAYS,
    status: "active",
    settings: {
      billingProvider: "efi",
      efiTxid: txid,
      efiPaidAt: new Date().toISOString(),
    },
  });

  if (!result.ok) {
    if (/e-mail|slug/i.test(result.error)) {
      await deleteSignupDraft(draftId);
      return { ok: true, already: true };
    }
    return { ok: false, error: result.error };
  }

  await deleteSignupDraft(draftId);
  await notifyNewAccount({
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    ownerWhatsapp: draft.ownerWhatsapp,
    tenantName: draft.tenantName,
    trialDays: 0,
  });
  return { ok: true };
}
