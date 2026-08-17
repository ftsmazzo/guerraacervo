import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ManageSubscriptionButton } from "@/components/manage-subscription-button";
import { PainelMobileNav } from "@/components/painel-mobile-nav";
import { PushAlertsCard } from "@/components/push-enable-button";
import { RegisterPainelServiceWorker } from "@/components/register-painel-sw";
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
  { href: "/painel/desejos", label: "Desejos", entitlement: "wishlist" },
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
  { href: "/painel/indique", label: "Indique e ganhe" },
  { href: "/painel/assinatura", label: "Assinatura" },
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
  // Admin sem sebo vê o aviso no painel; mandar a /admin com cookie antigo gerava loop.

  const planCode = ctx.tenant?.planCode;
  const isPersonal = ctx.tenant?.product === "personal";
  const access = ctx.tenant ? tenantAccessOk(ctx.tenant) : { ok: true };
  const trial = ctx.tenant
    ? trialLabel(ctx.tenant.trialEndsAt, ctx.tenant.status)
    : null;
  const alerts =
    ctx.tenant && !isPersonal ? await listTenantAlerts(ctx.tenant.id, 5) : [];
  const pathname = (await headers()).get("x-pathname") || "";
  const billingOpen = pathname.startsWith("/painel/assinatura");
  const visibleNav = nav.filter((item) => allowed(planCode, item.entitlement));
  const mobileNav = isPersonal
    ? [
        { href: "/painel", label: "Início" },
        { href: "/painel/livros", label: "Livros" },
        { href: "/painel/desejos", label: "Desejos" },
        { href: "/painel/assinatura", label: "Plano" },
      ]
    : [
        { href: "/painel", label: "Início" },
        { href: "/painel/pedidos", label: "Pedidos" },
        { href: "/painel/livros", label: "Livros" },
        { href: "/painel/relatorios", label: "Relatórios" },
        { href: "/painel/loja#app-celular", label: "Loja" },
      ];

  return (
    <div className="painel-shell min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <RegisterPainelServiceWorker />
      <aside className="relative z-20 hidden min-h-screen border-r border-sidebar-line bg-sidebar-bg text-[#e8eef7] md:block">
        <div className="brand-spectrum-bar" />
        <div className="flex h-[58px] items-center gap-2.5 border-b border-sidebar-line px-3.5">
          <Image
            src="/prismabook-icon.png"
            alt="PrismaBook"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-[7px]"
            priority
          />
          <div className="min-w-0">
            <p className="truncate text-[0.9rem] font-bold text-white">
              PrismaBook
            </p>
            <p className="truncate text-[0.62rem] text-[#9eb4ce]">
              {isPersonal ? "Sua biblioteca" : "Painel do sebo"}
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border-l-[3px] border-transparent px-3 py-2 text-[0.875rem] font-medium text-[#e8eef7] hover:border-brand-amber hover:bg-sidebar-item-hover hover:text-white"
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="border-t border-sidebar-line px-5 py-4">
          {ctx.user.isPlatformAdmin ? (
            <Link
              href="/admin"
              className="text-xs text-[#9eb4ce] hover:text-white"
            >
              Admin plataforma →
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="relative z-10 min-w-0 bg-background pb-20 md:pb-0">
        <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 md:h-[58px] md:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {ctx.tenant?.name ?? "Sem tenant"}
              </p>
              <p className="truncate text-xs text-muted">
                <span className="md:hidden">
                  {isPersonal ? "Biblioteca · " : "Reservas · "}
                </span>
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
          {ctx.tenant && access.ok && !isPersonal ? (
            <div className="border-t border-line px-4 py-2 md:hidden">
              <PushAlertsCard variant="compact" />
            </div>
          ) : null}
        </header>

        {trial && access.ok ? (
          <div className="border-b border-line bg-accent-soft px-4 py-2.5 text-sm text-accent-text md:px-6 md:py-3">
            Período de teste: {trial}.{" "}
            <Link href="/painel/assinatura" className="underline">
              Assinar sem perder o acesso
            </Link>
            <span className="text-muted"> — sem cartão agora; cobrança só se quiser continuar.</span>
          </div>
        ) : null}
        {access.ok && alerts.length ? (
          <ReservationAlertsBanner alerts={alerts} />
        ) : null}
        {!access.ok && !billingOpen ? (
          <div className="px-4 py-10 md:px-6">
            <div className="max-w-lg rounded-lg border border-line bg-card p-6">
              <h2 className="text-lg font-semibold text-ink">Acesso bloqueado</h2>
              <p className="mt-2 text-sm text-muted">{access.reason}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/painel/assinatura"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
                >
                  Escolher pagamento
                </Link>
                <ManageSubscriptionButton />
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 md:px-6 md:py-6">{children}</div>
        )}
      </div>

      <PainelMobileNav items={mobileNav} />
    </div>
  );
}
