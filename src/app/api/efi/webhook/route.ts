import { NextResponse } from "next/server";
import { fulfillEfiPix } from "@/lib/efi/fulfill";

/**
 * Efí faz GET na URL para validar o webhook (precisa 200).
 * POST traz o array `pix` quando a cobrança é paga.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    pix?: Array<{ txid?: string }>;
  } | null;

  const txids = (body?.pix || [])
    .map((p) => p.txid?.trim())
    .filter((id): id is string => Boolean(id));

  for (const txid of txids) {
    const result = await fulfillEfiPix(txid).catch((e) => {
      console.error("[efi webhook]", txid, e);
      return { ok: false as const, error: String(e) };
    });
    if (!result.ok) {
      console.error("[efi webhook] fulfill", txid, result.error);
    }
  }

  return NextResponse.json({ ok: true });
}
