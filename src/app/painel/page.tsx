import Link from "next/link";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { countTenantClients } from "@/lib/clients/queries";
import { countOpenOrders } from "@/lib/orders/queries";
import { canAddBook, countTenantBooks } from "@/lib/tenant-limits";
import { getPlan } from "@/lib/plans";
import { countWishItems } from "@/lib/wishlist/queries";

export default async function PainelDashboardPage() {
  const ctx = await getAuthContext();
  const tenantId = ctx?.tenant?.id;
  const planCode = ctx?.tenant?.planCode ?? "";
  const plan = getPlan(planCode);
  const isPersonal = ctx?.tenant?.product === "personal";

  const bookCount = tenantId ? await countTenantBooks(tenantId) : 0;
  const limit = tenantId
    ? await canAddBook(tenantId, planCode)
    : { ok: true, current: 0, max: null as number | null };
  const wishCount =
    tenantId && hasEntitlement(planCode, "wishlist")
      ? await countWishItems(tenantId)
      : null;
  const clientCount =
    !isPersonal && tenantId && hasEntitlement(planCode, "clients")
      ? await countTenantClients(tenantId)
      : null;
  const openOrders =
    !isPersonal && tenantId && hasEntitlement(planCode, "orders")
      ? await countOpenOrders(tenantId)
      : null;

  const cards = isPersonal
    ? [
        {
          label: "Livros na estante",
          value:
            limit.max === null
              ? String(bookCount)
              : `${bookCount} / ${limit.max}`,
        },
        {
          label: "Lista de desejos",
          value: wishCount === null ? "—" : String(wishCount),
        },
      ]
    : [
        {
          label: "Títulos no catálogo",
          value:
            limit.max === null
              ? String(bookCount)
              : `${bookCount} / ${limit.max}`,
        },
        {
          label: "Clientes",
          value: clientCount === null ? "—" : String(clientCount),
        },
        {
          label: "Pedidos abertos",
          value: openOrders === null ? "—" : String(openOrders),
        },
      ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Olá, {ctx?.user.name ?? "usuário"}. Plano{" "}
        <span className="font-medium text-ink">{plan?.name ?? "—"}</span>
        {plan?.maxBooks !== null && plan?.maxBooks !== undefined
          ? ` · limite de ${plan.maxBooks.toLocaleString("pt-BR")} livros`
          : plan
            ? " · livros ilimitados"
            : null}
        .
      </p>
      {!isPersonal ? (
        <p className="mt-3 rounded-md border border-line bg-card px-3 py-2.5 text-sm text-muted md:hidden">
          No celular da prateleira:{" "}
          <Link href="/painel/loja#app-celular" className="font-medium text-accent-text underline">
            instale o app e ative alertas
          </Link>
          .
        </p>
      ) : (
        <p className="mt-3 rounded-md border border-line bg-card px-3 py-2.5 text-sm text-muted">
          Cadastre os livros que você tem e os que procura. Isso vira a base para
          cruzar com sebos depois.
        </p>
      )}
      {!limit.ok ? (
        <p className="mt-3 rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-accent-text">
          Limite de livros do plano atingido ({limit.current}/{limit.max}).
          Remova títulos ou faça upgrade para cadastrar novos.
        </p>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-line bg-card p-4 shadow-[var(--shadow)]"
          >
            <p className="text-xs text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
