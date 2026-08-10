import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/authenticate";
import { setSessionCookie, signSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe e-mail e senha válidos." },
      { status: 400 },
    );
  }

  const result = await authenticateUser(
    parsed.data.email,
    parsed.data.password,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const token = await signSession(result.session);
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: {
      email: result.session.email,
      name: result.session.name,
      isPlatformAdmin: result.session.isPlatformAdmin,
    },
    tenant: result.session.tenantSlug
      ? {
          slug: result.session.tenantSlug,
          name: result.session.tenantName,
          planCode: result.session.planCode,
        }
      : null,
  });
}
