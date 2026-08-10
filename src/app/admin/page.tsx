import Link from "next/link";
import { getAdminStats } from "@/app/admin/actions";

export default async function AdminHomePage() {
  const stats = await getAdminStats();

  const cards = [
    { label: "Total de contas", value: stats.total, href: "/admin/tenants" },
    { label: "Ativas", value: stats.active, href: "/admin/tenants?status=active" },
    {
      label: "Em trial",
      value: stats.trialing,
      href: "/admin/tenants?status=trialing",
    },
    {
      label: "Suspensas",
      value: stats.suspended,
      href: "/admin/tenants?status=suspended",
    },
    {
      label: "Em atraso",
      value: stats.past_due,
      href: "/admin/tenants?status=past_due",
    },
    {
      label: "Canceladas",
      value: stats.canceled,
      href: "/admin/tenants?status=canceled",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Visão geral</h1>
      <p className="mt-1 text-sm text-muted">
        Gerencie assinaturas: bloquear, liberar, mudar plano e estender trial.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-lg border border-line bg-card p-5 shadow-[var(--shadow)] hover:border-accent"
          >
            <p className="text-xs text-muted">{c.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Link
          href="/admin/tenants"
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Ver todas as contas
        </Link>
        <Link
          href="/admin/plans"
          className="rounded-md border border-line bg-card px-4 py-2.5 text-sm font-medium"
        >
          Catálogo de planos
        </Link>
      </div>
    </div>
  );
}
