import { NextResponse } from "next/server";
import {
  getScanSession,
  putScanResult,
  SCAN_PHOTO_MAX_CHARS,
  type ScanResult,
} from "@/lib/scan-sessions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Valida token (página mobile). */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const sess = await getScanSession(token);
  if (!sess) {
    return NextResponse.json(
      { ok: false, error: "Sessão expirada ou inválida." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    expiresAt: sess.createdAt + 300_000,
  });
}

/** Celular envia ISBN ou foto (público — auth = token). */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const sess = await getScanSession(token);
  if (!sess) {
    return NextResponse.json(
      { error: "Sessão expirada. Gere um novo QR no computador." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const type = b.type;
  const at = Date.now();

  let result: ScanResult;
  if (type === "isbn") {
    const code = String(b.code || "").trim();
    if (code.length < 8 || code.length > 32) {
      return NextResponse.json({ error: "Código inválido." }, { status: 400 });
    }
    result = { type: "isbn", code, at };
  } else if (type === "photo") {
    const imageBase64 = String(b.imageBase64 || "");
    if (!imageBase64.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Imagem inválida (use data URL)." },
        { status: 400 },
      );
    }
    if (imageBase64.length > SCAN_PHOTO_MAX_CHARS) {
      return NextResponse.json(
        { error: "Foto muito grande. Tire de novo mais de perto." },
        { status: 413 },
      );
    }
    result = { type: "photo", imageBase64, at };
  } else {
    return NextResponse.json(
      { error: "type deve ser isbn ou photo." },
      { status: 400 },
    );
  }

  const ok = await putScanResult(token, result);
  if (!ok) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
