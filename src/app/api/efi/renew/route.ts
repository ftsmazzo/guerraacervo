import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { efiConfigured, efiPixKey, getEfiPay } from "@/lib/efi/client";
import { ensureEfiWebhook } from "@/lib/efi/fulfill";
import { rememberEfiTenant } from "@/lib/efi/pending";
import { getPlan } from "@/lib/plans";

function chargeAmount(planCode: string) {
  const plan = getPlan(planCode);
  const n = plan?.priceMonthlyBrl;
  if (!n || n <= 0) return null;
  if (process.env.EFI_SANDBOX !== "false") return "1.00";
  return n.toFixed(2);
}

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!efiConfigured()) {
    return NextResponse.json({ error: "Pix não configurado." }, { status: 503 });
  }

  const amount = chargeAmount(ctx.tenant.planCode);
  if (!amount) {
    return NextResponse.json({ error: "Plano sem valor." }, { status: 400 });
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);
  if (!tenant) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  try {
    await ensureEfiWebhook().catch(() => null);
    const efi = await getEfiPay();
    const cob = await efi.pixCreateImmediateCharge({
      calendario: { expiracao: 60 * 60 },
      valor: { original: amount },
      chave: efiPixKey(),
      solicitacaoPagador: `GuerraAcervo ${tenant.planCode}`.slice(0, 140),
      infoAdicionais: [
        { nome: "Sebo", valor: tenant.name.slice(0, 140) },
        { nome: "Plano", valor: tenant.planCode },
      ],
    });
    const txid = cob.txid;
    if (!txid) {
      return NextResponse.json({ error: "Efí sem txid." }, { status: 502 });
    }
    await rememberEfiTenant(txid, tenant.id);

    let qrImage: string | null = cob.loc?.id
      ? ((await efi.pixGenerateQRCode({ id: cob.loc.id }).catch(() => null))
          ?.imagemQrcode ?? null)
      : null;
    if (qrImage && !qrImage.startsWith("data:")) {
      qrImage = `data:image/png;base64,${qrImage}`;
    }
    const copiaECola = cob.pixCopiaECola || "";
    if (!qrImage && copiaECola) {
      qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(copiaECola)}`;
    }

    return NextResponse.json({
      txid,
      copiaECola,
      qrImage,
      amount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
