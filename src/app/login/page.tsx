import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-card p-8 shadow-[var(--shadow)]">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← PrismaBook
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-ink">Entrar</h1>
        <p className="mt-2 text-sm text-muted">
          Acesse o painel do sebo com sua conta.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Carregando…</p>}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted">
          Sem conta?{" "}
          <Link href="/cadastro" className="text-accent-text underline">
            Começar teste
          </Link>
        </p>
      </div>
    </main>
  );
}
