import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { requirePlatformAdmin } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requirePlatformAdmin();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-ink">Admin PrismaBook</p>
            <p className="text-xs text-muted">
              {ctx.user.name} · {ctx.user.email}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/admin" className="text-muted hover:text-accent-text">
              Visão geral
            </Link>
            <Link
              href="/admin/tenants"
              className="text-muted hover:text-accent-text"
            >
              Contas
            </Link>
            <Link
              href="/admin/plans"
              className="text-muted hover:text-accent-text"
            >
              Planos
            </Link>
            <Link href="/painel" className="text-muted hover:text-ink">
              Painel sebo
            </Link>
            <LogoutButton className="text-muted hover:text-ink" />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
