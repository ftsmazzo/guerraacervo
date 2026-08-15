import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { books, tenants } from "@/db/schema";
import {
  publicStoreUrl,
  slugCandidatesFromSubdomain,
} from "@/lib/tenants/host";
import "./vitrine.css";

export const dynamic = "force-dynamic";

async function resolveTenant(slugParam: string) {
  const candidates = slugCandidatesFromSubdomain(slugParam);
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      storeEnabled: tenants.storeEnabled,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(inArray(tenants.slug, candidates))
    .limit(5);

  const exact = rows.find((r) => r.slug === slugParam);
  return exact || rows[0] || null;
}

function money(v: string | number | null) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function waLink(phone: string | null | undefined, text: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

export default async function VitrinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug: slugParam } = await params;
  const { q } = await searchParams;
  const tenant = await resolveTenant(slugParam);
  if (!tenant) notFound();
  if (tenant.status === "suspended" || tenant.status === "canceled") {
    notFound();
  }

  const settings = (tenant.settings || {}) as Record<string, unknown>;
  const notifyPhone =
    typeof settings.reservationNotifyWhatsapp === "string"
      ? settings.reservationNotifyWhatsapp
      : null;

  const busca = q?.trim() || "";
  const conditions = [
    eq(books.tenantId, tenant.id),
    gt(books.stock, 0),
  ];
  if (busca) {
    const like = `%${busca}%`;
    conditions.push(
      sql`(${books.title} ilike ${like} or ${books.author} ilike ${like} or coalesce(${books.isbn}, '') ilike ${like})`,
    );
  }

  const catalog = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      salePrice: books.salePrice,
      condition: books.condition,
      stock: books.stock,
    })
    .from(books)
    .where(and(...conditions))
    .orderBy(books.title)
    .limit(48);

  const storeUrl = publicStoreUrl(tenant.slug);
  const hello = waLink(
    notifyPhone,
    `Olá! Vi o catálogo de ${tenant.name} em ${storeUrl}`,
  );

  return (
    <main className="vitrine">
      <header className="vitrine__header">
        <div className="vitrine__brand">
          <p className="vitrine__eyebrow">PrismaBook</p>
          <h1 className="vitrine__name">{tenant.name}</h1>
          <p className="vitrine__host">{tenant.slug}.prismabook.com.br</p>
        </div>
        {hello ? (
          <a className="vitrine__cta" href={hello} target="_blank" rel="noreferrer">
            Falar no WhatsApp
          </a>
        ) : null}
      </header>

      <form className="vitrine__search" method="get">
        <input
          type="search"
          name="q"
          defaultValue={busca}
          placeholder="Buscar título, autor ou ISBN…"
          aria-label="Buscar no catálogo"
        />
        <button type="submit">Buscar</button>
      </form>

      {catalog.length === 0 ? (
        <p className="vitrine__empty">
          {busca
            ? "Nenhum livro encontrado com esse termo."
            : "Catálogo ainda sem livros à venda."}
        </p>
      ) : (
        <ul className="vitrine__grid">
          {catalog.map((b) => {
            const bookWa = waLink(
              notifyPhone,
              `Olá! Tenho interesse no livro "${b.title}"${b.author ? ` — ${b.author}` : ""}.`,
            );
            return (
              <li key={b.id} className="vitrine__card">
                <div className="vitrine__cover">
                  {b.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.coverUrl} alt="" />
                  ) : (
                    <span>Sem capa</span>
                  )}
                </div>
                <div className="vitrine__meta">
                  <h2>{b.title}</h2>
                  {b.author ? <p className="vitrine__author">{b.author}</p> : null}
                  <p className="vitrine__price">{money(b.salePrice)}</p>
                  {b.condition ? (
                    <p className="vitrine__cond">{b.condition}</p>
                  ) : null}
                  {bookWa ? (
                    <a href={bookWa} target="_blank" rel="noreferrer">
                      Pedir no Zap
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="vitrine__footer">
        Vitrine em {storeUrl} · powered by PrismaBook
      </footer>
    </main>
  );
}
