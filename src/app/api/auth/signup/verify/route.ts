import { NextResponse } from "next/server";
import {
  consumeOtpCode,
  getSignupDraft,
  markDraftOtpVerified,
} from "@/lib/signup/pending";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    draftId?: string;
    code?: string;
  } | null;

  const draftId = body?.draftId?.trim();
  const code = body?.code?.trim();
  if (!draftId || !code) {
    return NextResponse.json(
      { error: "draftId e código obrigatórios." },
      { status: 400 },
    );
  }

  const draft = await getSignupDraft(draftId);
  if (!draft) {
    return NextResponse.json(
      { error: "Cadastro expirado. Recomece." },
      { status: 400 },
    );
  }

  const ok = await consumeOtpCode(draft.ownerWhatsapp, code);
  if (!ok) {
    return NextResponse.json(
      { error: "Código inválido ou expirado." },
      { status: 400 },
    );
  }

  await markDraftOtpVerified(draftId);
  return NextResponse.json({ ok: true });
}
