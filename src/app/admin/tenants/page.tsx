import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { CreateTenantForm } from "@/app/admin/tenants/create-tenant-form";
import { DeleteTenantButton } from "@/app/admin/tenants/delete-tenant-button";
import { db } from "@/db";
import { books, memberships, tenants, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getPlan } from "@/lib/plans";

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const status = sp.status?.trim() || "";
  const q = sp.q?.trim() || "";

  const conditions = [];
  if (status) conditions.push(eq(tenants.status, status as never));
  if (q) {
    conditions.push(
      sql`(${tenants.name} ilike ${"%" + q + "%"} or ${tenants.slug} ilike ${"%" + q + "%"})`,
    );
  }

  const rows = await db
    .select({
      tenant: tenants,
      bookCount: sql<number>`(select count(*)::int from ${books} where ${books.tenantId} = ${tenants.id})`,
    })
    .from(tenants)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tenants.createdAt));

  const owners = await db
    .select({
      tenantId: memberships.tenantId,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.role, "owner"));

  const ownerByTenant = new Map(
    owners.map((o) => [o.tenantId, o] as const),
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Contas</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} conta(s) · clique para gerenciar assinatura
          </p>
        </div>
        <form className="flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar nome ou slug…"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm"
          />
          <select
            name="status"
            defaultValue={status}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="trialing">Trial</option>
            <option value="active">Ativa</option>
            <option value="past_due">Em atraso</option>
            <option value="suspended">Suspensa</option>
            <option value="canceled">Cancelada</option>
          </select>
          <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">
            Filtrar
          </button>
        </form>
      </div>

      <CreateTenantForm />

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Conta</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Trial</th>
              <th className="px-4 py-3 font-medium">Livros</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ tenant, bookCount }) => {
              const plan = getPlan(tenant.planCode);
              const owner = ownerByTenant.get(tenant.id);
              return (
                <tr key={tenant.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{tenant.name}</p>
                    <p className="font-mono text-xs text-muted">{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3">{plan?.name ?? tenant.planCode}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {tenant.trialEndsAt
                      ? tenant.trialEndsAt.toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{bookCount}</td>
                  <td className="px-4 py-3 text-xs">
                    {owner ? (
                      <>
                        <div>{owner.name}</div>
                        <div className="text-muted">{owner.email}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="text-accent-text hover:underline"
                    >
                      Gerenciar
                    </Link>
                    <span className="mx-2 text-line">·</span>
                    <DeleteTenantButton
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                    />
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Nenhuma conta encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-800 border-green-200",
    trialing: "bg-accent-soft text-accent-text border-line",
    past_due: "bg-amber-50 text-amber-900 border-amber-200",
    suspended: "bg-red-50 text-red-800 border-red-200",
    canceled: "bg-background text-muted border-line",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
