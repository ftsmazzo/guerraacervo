import Link from "next/link";
import { Suspense } from "react";
import { CadastroForm } from "./cadastro-form";
import "@/components/landing/landing.css";

export default function CadastroPage() {
  return (
    <main className="landing-funnel">
      <header className="landing-funnel__header">
        <Link href="/" className="landing-funnel__brand">
          PrismaBook
        </Link>
        <p className="landing-funnel__sub">
          Cadastro · 14 dias grátis, sem cartão
        </p>
      </header>
      <Suspense
        fallback={
          <p className="px-6 py-8 text-sm" style={{ color: "var(--lp-ink-soft)" }}>
            Carregando…
          </p>
        }
      >
        <CadastroForm />
      </Suspense>
    </main>
  );
}
