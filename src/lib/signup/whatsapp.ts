import {
  normalizePhone,
  resolveEvolutionConfig,
  sendTextMessage,
} from "@/lib/whatsapp/evolution";

/** Instância Evolution usada para OTP/boas-vindas da plataforma. */
export function signupWhatsappInstance() {
  return (
    process.env.SIGNUP_WHATSAPP_INSTANCE?.trim() ||
    process.env.PLATFORM_WA_INSTANCE?.trim() ||
    "ga-sebo-demo"
  );
}

export async function sendSignupWhatsapp(
  phoneRaw: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = resolveEvolutionConfig();
  if (!cfg) {
    return { ok: false, error: "WhatsApp da plataforma não configurado." };
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, error: "Telefone inválido." };
  try {
    await sendTextMessage(cfg, signupWhatsappInstance(), phone, text);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function otpMessage(code: string) {
  return (
    `*GuerraAcervo* — código de verificação:\n\n` +
    `*${code}*\n\n` +
    `Válido por 10 minutos. Se você não pediu, ignore.`
  );
}

export function welcomeMessage(opts: {
  ownerName: string;
  tenantName: string;
  trialDays: number;
  loginUrl: string;
}) {
  const first = opts.ownerName.split(" ")[0] || opts.ownerName;
  const period =
    opts.trialDays > 0
      ? `Trial de *${opts.trialDays} dias* ativo.`
      : `Assinatura *Pix* confirmada.`;
  return (
    `Oi, ${first}! Conta *${opts.tenantName}* criada no GuerraAcervo 📚\n\n` +
    `${period}\n` +
    `Acesse: ${opts.loginUrl}\n\n` +
    `Depois, em *Loja*, conecte o WhatsApp do sebo (QR) para o agente atender seus clientes.`
  );
}
