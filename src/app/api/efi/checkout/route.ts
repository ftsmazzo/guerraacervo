import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  efiConfigured,
  efiPixKey,
  getEfiPay,
} from "@/lib/efi/client";
import { ensureEfiWebhook } from "@/lib/efi/fulfill";
import { rememberEfiDraft } from "@/lib/efi/pending";
import { getPlan } from "@/lib/plans";
import { getSignupDraft, isDraftOtpVerified } from "@/lib/signup/pending";

function planAmount(planCode: string) {
  const plan = getPlan(planCode);
  const n = plan?.priceMonthlyBrl;
  if (!n || n <= 0) return null;
  // Homologação Efí só confirma sozinha cobrança até R$ 10.
  if (process.env.EFI_SANDBOX !== "false") return "1.00";
  return n.toFixed(2);
}

export async function POST(req: Request) {
  if (!efiConfigured()) {
    return NextResponse.json(
      { error: "Pix Efí ainda não configurado." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { draftId?: string } | null;
  const draftId = body?.draftId?.trim();
  if (!draftId) {
    return NextResponse.json({ error: "draftId obrigatório." }, { status: 400 });
  }

  const draft = await getSignupDraft(draftId);
  if (!draft) {
    return NextResponse.json(
      { error: "Cadastro expirado. Recomece o formulário." },
      { status: 400 },
    );
  }
  if (!(await isDraftOtpVerified(draftId))) {
    return NextResponse.json(
      { error: "Confirme o código WhatsApp antes do pagamento." },
      { status: 403 },
    );
  }

  const amount = planAmount(draft.planCode);
  if (!amount) {
    return NextResponse.json({ error: "Plano sem valor mensal." }, { status: 400 });
  }

  const [emailTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, draft.ownerEmail))
    .limit(1);
  if (emailTaken) {
    return NextResponse.json(
      { error: "Já existe usuário com este e-mail." },
      { status: 409 },
    );
  }

  try {
    await ensureEfiWebhook().catch((e) => {
      console.warn("[efi] webhook config", e instanceof Error ? e.message : e);
    });

    const efi = await getEfiPay();
    const cob = await efi.pixCreateImmediateCharge({
      calendario: { expiracao: 60 * 60 },
      valor: { original: amount },
      chave: efiPixKey(),
      solicitacaoPagador: `PrismaBook ${draft.planCode}`.slice(0, 140),
      infoAdicionais: [
        { nome: "Sebo", valor: draft.tenantName.slice(0, 140) },
        { nome: "Plano", valor: draft.planCode },
      ],
    });

    const txid = cob.txid;
    if (!txid) {
      return NextResponse.json(
        { error: "Efí não retornou txid." },
        { status: 502 },
      );
    }
    await rememberEfiDraft(txid, draftId);

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
      planCode: draft.planCode,
      expiresIn: cob.calendario?.expiracao || 3600,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[efi checkout]", msg);
    return NextResponse.json(
      { error: `Falha ao gerar Pix: ${msg}` },
      { status: 502 },
    );
  }
}
