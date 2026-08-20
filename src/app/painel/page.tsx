import Link from "next/link";
import { PushAlertsCard } from "@/components/push-enable-button";
import { LogPagesForm } from "@/components/reading/reading-ui";
import { ReadingBookCard } from "@/components/reading/reading-cover";
import "@/components/reading/reading-cover.css";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { countTenantClients } from "@/lib/clients/queries";
import { countOpenOrders } from "@/lib/orders/queries";
import { canAddBook, countTenantBooks } from "@/lib/tenant-limits";
import { getPlan } from "@/lib/plans";
import { countWishItems } from "@/lib/wishlist/queries";
import {
  countByReadingStatus,
  getReadingPlan,
  listCurrentlyReading,
  pagesReadOn,
  readingStreak,
} from "@/lib/reading/queries";
import { todayInTimeZone } from "@/lib/reading/types";
import { countLibraryDashboard } from "@/lib/library/queries";

export const dynamic = "force-dynamic";

export default async function PainelDashboardPage() {
  const ctx = await getAuthContext();
  const tenantId = ctx?.tenant?.id;
  const planCode = ctx?.tenant?.planCode ?? "";
  const plan = getPlan(planCode);
  const isPersonal = ctx?.tenant?.product === "personal";
  const isLibrary = ctx?.tenant?.product === "library";

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
    !isPersonal && !isLibrary && tenantId && hasEntitlement(planCode, "orders")
      ? await countOpenOrders(tenantId)
      : null;
  const libraryDash =
    isLibrary && tenantId
      ? await countLibraryDashboard(tenantId)
      : null;

  const readingPlan = isPersonal && tenantId ? await getReadingPlan(tenantId) : null;
  const tz = readingPlan?.timezone || "America/Sao_Paulo";
  const today = todayInTimeZone(tz);
  const todayPages =
    isPersonal && tenantId ? await pagesReadOn(tenantId, today) : 0;
  const streak =
    isPersonal && tenantId ? await readingStreak(tenantId, tz) : 0;
  const currently =
    isPersonal && tenantId ? await listCurrentlyReading(tenantId, 4) : [];
  const shelves =
    isPersonal && tenantId
      ? await countByReadingStatus(tenantId)
      : { quero_ler: 0, lendo: 0, lido: 0, abandonado: 0 };
  const goal = readingPlan?.dailyPages ?? 20;

  const cards = isPersonal
    ? [
        {
          label: "Lendo agora",
          value: String(shelves.lendo),
        },
        {
          label: "Meta de hoje",
          value: `${todayPages} / ${goal}`,
        },
        {
          label: "Sequência",
          value: streak ? `${streak} dia${streak === 1 ? "" : "s"}` : "0",
        },
        {
          label: "Livros na estante",
          value:
            limit.max === null
              ? String(bookCount)
              : `${bookCount} / ${limit.max}`,
        },
      ]
    : isLibrary
      ? [
          {
            label: "Títulos no acervo",
            value:
              limit.max === null
                ? String(bookCount)
                : `${bookCount} / ${limit.max}`,
          },
          {
            label: "Leitores",
            value: clientCount === null ? "—" : String(clientCount),
          },
          {
            label: "Empréstimos abertos",
            value: String(libraryDash?.openLoans ?? 0),
          },
          {
            label: "Atrasados",
            value: String(libraryDash?.overdue ?? 0),
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
      <h1 className="text-2xl font-semibold text-ink">
        {isPersonal ? "Início" : "Dashboard"}
      </h1>
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
      {!isPersonal && !isLibrary ? (
        <p className="mt-3 rounded-md border border-line bg-card px-3 py-2.5 text-sm text-muted md:hidden">
          No celular da prateleira:{" "}
          <Link href="/painel/loja#app-celular" className="font-medium text-accent-text underline">
            instale o app e ative alertas
          </Link>
          .
        </p>
      ) : null}
      {isLibrary ? (
        <p className="mt-3 rounded-md border border-line bg-card px-3 py-2.5 text-sm text-muted">
          Balcão:{" "}
          <Link href="/painel/circulacao" className="font-medium text-accent-text underline">
            emprestar e devolver
          </Link>
          .
        </p>
      ) : null}
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

      {isPersonal ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Lendo agora</h2>
              <Link href="/painel/livros" className="text-xs text-accent-text underline">
                Estante
              </Link>
            </div>
            {!currently.length ? (
              <p className="mt-3 rounded-lg border border-dashed border-line bg-card p-4 text-sm text-muted">
                Nenhum livro em leitura. Mova um da prateleira{" "}
                <Link href="/painel/livros?shelf=quero_ler" className="underline">
                  Quero ler
                </Link>{" "}
                para Lendo, ou cadastre um novo.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {currently.map((b, i) => (
                  <ReadingBookCard
                    key={b.id}
                    bookId={b.id}
                    title={b.title}
                    author={b.author}
                    coverUrl={b.coverUrl}
                    currentPage={b.currentPage}
                    pages={b.pages}
                    readingStatus="lendo"
                    size={i === 0 ? "lg" : "md"}
                    showStatus={false}
                  />
                ))}
              </div>
            )}
            <div className="mt-4 rounded-lg border border-line bg-card p-4">
              <p className="text-sm font-medium text-ink">Marquei páginas hoje</p>
              <p className="text-xs text-muted">
                Vale para a meta mesmo se ainda não souber o livro.
              </p>
              <LogPagesForm />
            </div>
          </section>
          <aside className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border border-line bg-card p-4">
              <div
                className="reading-ring"
                style={{ ["--ring-pct" as string]: Math.min(100, Math.round((todayPages / goal) * 100)) }}
              >
                <div className="reading-ring-inner">
                  <p className="text-[0.65rem] font-semibold leading-tight text-ink">
                    {todayPages}/{goal}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Meta de hoje</p>
                <p className="text-xs text-muted">
                  {todayPages >= goal
                    ? "Meta do dia fechada."
                    : `Faltam ${Math.max(0, goal - todayPages)} página(s).`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-line bg-card p-4">
              <span className="reading-streak-flame" aria-hidden>
                {streak > 0 ? "🔥" : "✨"}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {streak
                    ? `${streak} dia${streak === 1 ? "" : "s"} seguidos`
                    : "Comece a sequência"}
                </p>
                <p className="text-xs text-muted">
                  Marque páginas hoje para manter o hábito.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="text-xs text-muted">Lista de desejos</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {wishCount === null ? "—" : String(wishCount)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Títulos para achar no sebo — diferente do “quero ler” da estante.
              </p>
              <Link
                href="/painel/desejos"
                className="mt-2 inline-block text-xs text-accent-text underline"
              >
                Abrir desejos
              </Link>
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="text-sm font-medium text-ink">Lembrete</p>
              <p className="mt-1 text-xs text-muted">
                {readingPlan?.enabled === false
                  ? "Lembrete desligado."
                  : `Avisamos às ${readingPlan?.remindAt ?? "21:00"} se a meta ainda estiver aberta.`}
              </p>
              <Link
                href="/painel/leitura"
                className="mt-2 inline-block text-xs text-accent-text underline"
              >
                Ajustar plano
              </Link>
            </div>
            <PushAlertsCard variant="card" kind="leitura" />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
