import { sendAccessEmail } from "@/lib/signup/email";
import {
  sendSignupWhatsapp,
  welcomeMessage,
} from "@/lib/signup/whatsapp";
import { appPublicUrl } from "@/lib/stripe/client";

export async function notifyNewAccount(opts: {
  ownerName: string;
  ownerEmail: string;
  ownerWhatsapp: string;
  tenantName: string;
  trialDays: number;
}) {
  await sendAccessEmail({
    to: opts.ownerEmail,
    ownerName: opts.ownerName,
    tenantName: opts.tenantName,
    trialDays: opts.trialDays,
  });
  const loginUrl = `${appPublicUrl()}/login`;
  await sendSignupWhatsapp(
    opts.ownerWhatsapp,
    welcomeMessage({
      ownerName: opts.ownerName,
      tenantName: opts.tenantName,
      trialDays: opts.trialDays,
      loginUrl,
    }),
  );
}
