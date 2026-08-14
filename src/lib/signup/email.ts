import { appPublicUrl } from "@/lib/stripe/client";

export async function sendAccessEmail(opts: {
  to: string;
  ownerName: string;
  tenantName: string;
  trialDays: number;
}): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  const loginUrl = `${appPublicUrl()}/login`;
  const subject = `Acesso PrismaBook — ${opts.tenantName}`;
  const text =
    `Olá, ${opts.ownerName}!\n\n` +
    `Sua conta do sebo "${opts.tenantName}" está pronta.\n` +
    `Trial: ${opts.trialDays} dias.\n\n` +
    `Entre em: ${loginUrl}\n` +
    `E-mail: ${opts.to}\n` +
    `(Use a senha definida no cadastro.)\n\n` +
    `Equipe PrismaBook\n`;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || "PrismaBook <onboarding@resend.dev>";

  if (!apiKey) {
    console.info("[signup email] RESEND_API_KEY ausente — e-mail não enviado.", {
      to: opts.to,
      subject,
    });
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Falha Resend: ${res.status} ${detail.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
