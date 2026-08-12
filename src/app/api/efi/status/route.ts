import { NextResponse } from "next/server";
import { getEfiPay } from "@/lib/efi/client";
import { fulfillEfiPix } from "@/lib/efi/fulfill";
import { getSignupDraft } from "@/lib/signup/pending";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const txid = url.searchParams.get("txid")?.trim();
  const draftId = url.searchParams.get("draftId")?.trim();
  if (!txid) {
    return NextResponse.json({ error: "txid obrigatório." }, { status: 400 });
  }

  try {
    const efi = await getEfiPay();
    const cob = await efi.pixDetailCharge({ txid });
    const paid = cob.status === "CONCLUIDA";
    if (paid) {
      const done = await fulfillEfiPix(txid);
      if (!done.ok) {
        return NextResponse.json({
          status: cob.status,
          paid: false,
          error: done.error,
        });
      }
    }

    const draftGone = draftId ? !(await getSignupDraft(draftId)) : false;
    return NextResponse.json({
      status: cob.status || "DESCONHECIDO",
      paid: paid || draftGone,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
