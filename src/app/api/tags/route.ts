import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookTags, tags } from "@/db/schema";
import { getAuthContext, tenantAccessOk } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const access = tenantAccessOk(ctx.tenant);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason ?? "Acesso bloqueado." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const tenantId = ctx.tenant.id;

  if (q.length < 1) {
    const rows = await db
      .select({
        nome: tags.name,
        qtd: count(bookTags.bookId),
      })
      .from(tags)
      .leftJoin(bookTags, eq(bookTags.tagId, tags.id))
      .where(eq(tags.tenantId, tenantId))
      .groupBy(tags.id, tags.name)
      .orderBy(desc(count(bookTags.bookId)), asc(tags.name))
      .limit(20);

    return NextResponse.json(rows.map((r) => r.nome));
  }

  const rows = await db
    .select({ nome: tags.name })
    .from(tags)
    .where(
      and(eq(tags.tenantId, tenantId), ilike(tags.name, `%${q}%`)),
    )
    .orderBy(asc(tags.name))
    .limit(15);

  return NextResponse.json(rows.map((r) => r.nome));
}
