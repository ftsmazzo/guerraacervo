import Link from "next/link";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { books, memberships, tenants, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getPlan, PLANS } from "@/lib/plans";
import { TenantActionsForm } from "./tenant-actions-form";

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
  if (!tenant) notFound();

  const [bookRow] = await db
    .select({ value: count() })
    .from(books)
    .where(eq(books.tenantId, tenant.id));

  const members = await db
    .select({
      role: memberships.role,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.tenantId, tenant.id));

  const plan = getPlan(tenant.planCode);
  const planOptions = Object.values(PLANS).filter(
    (p) => p.product === "business",
  );

  return (
    <div>
      <Link
        href="/admin/tenants"
        className="text-sm text-muted hover:text-accent-text"
      >
        ← Contas
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-ink">{tenant.name}</h1>
      <p className="font-mono text-sm text-muted">{tenant.slug}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-card p-4">
          <p className="text-xs text-muted">Plano atual</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {plan?.name ?? tenant.planCode}
          </p>
          <p className="text-xs text-muted">
            {plan?.maxBooks == null
              ? "Livros ilimitados"
              : `Até ${plan.maxBooks} livros`}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-card p-4">
          <p className="text-xs text-muted">Status</p>
          <p className="mt-1 text-lg font-semibold text-ink">{tenant.status}</p>
          <p className="text-xs text-muted">
            Trial até{" "}
            {tenant.trialEndsAt
              ? tenant.trialEndsAt.toLocaleDateString("pt-BR")
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-card p-4">
          <p className="text-xs text-muted">Livros no catálogo</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {Number(bookRow?.value ?? 0)}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <TenantActionsForm
          tenantId={tenant.id}
          currentPlan={tenant.planCode}
          currentStatus={tenant.status}
          planOptions={planOptions.map((p) => ({
            code: p.code,
            name: p.name,
          }))}
        />

        <div className="rounded-lg border border-line bg-card p-5">
          <h2 className="font-semibold text-ink">Membros</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {members.map((m) => (
              <li
                key={m.email}
                className="flex items-center justify-between border-b border-line py-2 last:border-0"
              >
                <div>
                  <p className="font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-muted">{m.email}</p>
                </div>
                <span className="text-xs text-muted">{m.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
