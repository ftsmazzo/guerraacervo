import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getScanSession, takeScanResult } from "@/lib/scan-sessions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Desktop poll — consome resultado uma vez. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getAuthContext();
  if (!auth?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const sess = await getScanSession(token);
  if (!sess) {
    return NextResponse.json(
      { pending: false, expired: true },
      { status: 200 },
    );
  }
  if (sess.tenantId !== auth.tenant.id || sess.userId !== auth.user.id) {
    return NextResponse.json({ error: "Sessão de outro usuário." }, { status: 403 });
  }

  const result = await takeScanResult(token);
  if (!result) {
    return NextResponse.json({ pending: true, expired: false });
  }

  if (result.type === "isbn") {
    return NextResponse.json({
      pending: false,
      expired: false,
      type: "isbn",
      code: result.code,
    });
  }

  return NextResponse.json({
    pending: false,
    expired: false,
    type: "photo",
    imageBase64: result.imageBase64,
  });
}
