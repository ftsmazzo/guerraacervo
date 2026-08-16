import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import {
  buildSignupDraft,
  newDraftId,
  saveSignupDraft,
  setOtpCode,
} from "@/lib/signup/pending";
import { otpMessage, sendSignupWhatsapp } from "@/lib/signup/whatsapp";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    tenantName?: string;
    ownerName?: string;
    ownerEmail?: string;
    password?: string;
    ownerWhatsapp?: string;
    planCode?: string;
    slug?: string;
    referralCode?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const built = await buildSignupDraft({
    tenantName: body.tenantName || "",
    ownerName: body.ownerName || "",
    ownerEmail: body.ownerEmail || "",
    password: body.password || "",
    ownerWhatsapp: body.ownerWhatsapp || "",
    planCode: body.planCode || "",
    slug: body.slug,
    referralCode: body.referralCode,
  });
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const draft = built.draft;
  if (!draft.ownerName) {
    return NextResponse.json(
      { error: "Preencha seu nome." },
      { status: 400 },
    );
  }
  if (!draft.tenantName) {
    return NextResponse.json(
      { error: "Preencha o nome da conta." },
      { status: 400 },
    );
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

  const [slugTaken] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, draft.slug))
    .limit(1);
  if (slugTaken) {
    return NextResponse.json(
      { error: `Identificador "${draft.slug}" já está em uso. Escolha outro nome.` },
      { status: 409 },
    );
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const draftId = newDraftId();
  await saveSignupDraft(draftId, draft);
  await setOtpCode(draft.ownerWhatsapp, code);

  const sent = await sendSignupWhatsapp(draft.ownerWhatsapp, otpMessage(code));
  if (!sent.ok) {
    return NextResponse.json(
      {
        error: `Não foi possível enviar o WhatsApp: ${sent.error}`,
        draftId,
        // em dev, facilita testar sem Evolution
        debugCode:
          process.env.NODE_ENV === "development" ||
          process.env.SIGNUP_OTP_DEBUG === "1"
            ? code
            : undefined,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    draftId,
    phoneHint: `***${draft.ownerWhatsapp.slice(-4)}`,
  });
}
