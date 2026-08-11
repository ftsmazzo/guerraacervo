import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ManageSubscriptionButton } from "@/components/manage-subscription-button";
import { PainelMobileNav } from "@/components/painel-mobile-nav";
import { PushAlertsCard } from "@/components/push-enable-button";
import { ReservationAlertsBanner } from "@/components/reservation-alerts-banner";
import {
  getAuthContext,
  hasEntitlement,
  tenantAccessOk,
} from "@/lib/auth/context";
import type { Entitlement } from "@/lib/plans";
import { listTenantAlerts } from "@/lib/tenant-alerts";

type NavItem = {
  href: string;
  label: string;
  entitlement?: Entitlement | Entitlement[];
};

const nav: NavItem[] = [
  { href: "/painel", label: "Dashboard" },
  { href: "/painel/livros", label: "Livros", entitlement: "catalog" },
  { href: "/painel/clientes", label: "Clientes", entitlement: "clients" },
  { href: "/painel/pedidos", label: "Pedidos", entitlement: "orders" },
  {
    href: "/painel/relatorios",
    label: "Relatórios",
    entitlement: "reports_basic",
  },
  {
    href: "/painel/loja",
    label: "Loja",
    entitlement: ["store_whatsapp", "store_pix"],
  },
];

function allowed(
  planCode: string | null | undefined,
  entitlement?: Entitlement | Entitlement[],
) {
  if (!entitlement) return true;
  if (Array.isArray(entitlement)) {
    return entitlement.some((e) => hasEntitlement(planCode, e));
  }
  return hasEntitlement(planCode, entitlement);
}

function trialLabel(trialEndsAt: Date | null, status: string) {
  if (status !== "trialing" || !trialEndsAt) return null;
  const days = Math.max(
    0,
    Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  return `${days} dia${days === 1 ? "" : "s"} restantes`;
}

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login?next=/painel");

  const planCode = ctx.tenant?.planCode;
  const access = ctx.tenant ? tenantAccessOk(ctx.tenant) : { ok: true };
  const trial = ctx.tenant
    ? trialLabel(ctx.tenant.trialEndsAt, ctx.tenant.status)
    : null;
  const alerts = ctx.tenant ? await listTenantAlerts(ctx.tenant.id, 5) : [];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="hidden border-r border-line bg-sidebar-bg md:block">
        <div className="flex h-[58px] items-center gap-2.5 border-b border-line px-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-accent text-sm font-semibold text-white">
            G
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.9rem] font-bold text-ink">
              GuerraAcervo
            </p>
            <p className="truncate text-[0.62rem] text-muted">Painel do sebo</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {nav
            .filter((item) => allowed(planCode, item.entitlement))
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border-l-[3px] border-transparent px-3 py-2 text-[0.835rem] text-sidebar-text hover:bg-sidebar-hover hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="border-t border-line px-5 py-4">
          {ctx.user.isPlatformAdmin ? (
            <Link
              href="/admin"
              className="text-xs text-muted hover:text-accent-text"
            >
              Admin plataforma →
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="bg-background pb-20 md:pb-0">
        <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 md:h-[58px] md:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {ctx.tenant?.name ?? "Sem tenant"}
              </p>
              <p className="truncate text-xs text-muted">
                <span className="md:hidden">Reservas · </span>
                Plano: {ctx.tenant?.planName ?? "—"}
                {trial ? ` · trial · ${trial}` : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-muted lg:inline">
                {ctx.user.email}
              </span>
              <div className="hidden sm:block">
                {ctx.tenant ? <ManageSubscriptionButton /> : null}
              </div>
              <LogoutButton className="text-sm text-muted hover:text-ink" />
            </div>
          </div>
          {ctx.tenant && access.ok ? (
            <div className="border-t border-line px-4 py-2 md:hidden">
              <PushAlertsCard variant="compact" />
            </div>
          ) : null}
        </header>

        {trial && access.ok ? (
          <div className="border-b border-line bg-accent-soft px-4 py-2.5 text-sm text-accent-text md:px-6 md:py-3">
            Período de teste: {trial}.{" "}
            <span className="text-muted">
              Use &quot;Gerenciar assinatura&quot; no PC para cartão ou
              cancelamento.
            </span>
          </div>
        ) : null}
        {access.ok && alerts.length ? (
          <ReservationAlertsBanner alerts={alerts} />
        ) : null}
        {!access.ok ? (
          <div className="px-4 py-10 md:px-6">
            <div className="max-w-lg rounded-lg border border-line bg-card p-6">
              <h2 className="text-lg font-semibold text-ink">Acesso bloqueado</h2>
              <p className="mt-2 text-sm text-muted">{access.reason}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <ManageSubscriptionButton />
                <Link
                  href="/cadastro"
                  className="text-sm text-accent-text underline"
                >
                  Novo cadastro
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 md:px-6 md:py-6">{children}</div>
        )}
      </div>

      <PainelMobileNav />
    </div>
  );
}
