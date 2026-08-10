import Link from "next/link";
import { businessPlans, personalPlans } from "@/lib/plans";

function formatPrice(value: number | null) {
  if (value === null) return "Trial";
  if (value === 0) return "Grátis";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function HomePage() {
  const negocio = businessPlans();
  const pessoal = personalPlans();

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ink">
              GuerraAcervo
            </p>
            <p className="text-xs text-muted">SaaS para sebos e coleções</p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-muted hover:text-ink"
            >
              Entrar
            </Link>
            <Link
              href="/painel"
              className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-dark"
            >
              Painel
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-3 text-sm font-medium text-accent-text">GuerraAcervo</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink">
          Gestão para sebos e coleções, online.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          Planos Negócio e Pessoal, multi-tenant, Postgres e Redis. Base pronta
          para auth, cobrança e o operacional do sebo.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/painel"
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark"
          >
            Abrir painel
          </Link>
          <Link
            href="/admin"
            className="rounded-md border border-line bg-card px-4 py-2.5 text-sm font-medium"
          >
            Admin plataforma
          </Link>
          <Link
            href="/api/health"
            className="rounded-md border border-line bg-card px-4 py-2.5 text-sm font-medium"
          >
            Health check
          </Link>
        </div>
      </section>

      <section className="border-t border-line bg-card">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="text-xl font-semibold text-ink">Negócio (MVP)</h2>
          <p className="mt-1 text-sm text-muted">
            Trial 7 dias · faixas por estoque · loja WhatsApp no Pro · Pix+IA no
            Master
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {negocio.map((plan) => (
              <article
                key={plan.code}
                className="rounded-lg border border-line p-5"
              >
                <h3 className="font-semibold text-ink">{plan.name}</h3>
                <p className="mt-1 text-2xl font-semibold text-accent">
                  {formatPrice(plan.priceMonthlyBrl)}
                  <span className="text-sm font-normal text-muted">/mês</span>
                </p>
                <p className="mt-2 text-sm text-muted">
                  {plan.maxBooks === null
                    ? "Livros ilimitados"
                    : `Até ${plan.maxBooks.toLocaleString("pt-BR")} livros`}
                </p>
                <ul className="mt-4 space-y-1 text-sm text-muted">
                  {plan.entitlements.map((e) => (
                    <li key={e}>· {e}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-xl font-semibold text-ink">Pessoal (roadmap)</h2>
        <p className="mt-1 text-sm text-muted">
          Freemium para colecionadores — construir após o Negócio web
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pessoal.map((plan) => (
            <article
              key={plan.code}
              className="rounded-lg border border-line bg-card p-4"
            >
              <h3 className="font-medium text-ink">{plan.name}</h3>
              <p className="mt-1 text-lg font-semibold">
                {formatPrice(plan.priceMonthlyBrl)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {plan.maxBooks === null
                  ? "Ilimitado"
                  : `${plan.maxBooks} livros`}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
