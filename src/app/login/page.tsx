import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-card p-8">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← GuerraAcervo
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-ink">Entrar</h1>
        <p className="mt-2 text-sm text-muted">
          Auth real (sessão + cookies) entra na próxima etapa. Por enquanto use
          o seed local após migrar o banco.
        </p>
        <form className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-muted">E-mail</span>
            <input
              type="email"
              defaultValue="admin@guerraacervo.local"
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2"
              disabled
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Senha</span>
            <input
              type="password"
              defaultValue="admin123"
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2"
              disabled
            />
          </label>
          <Link
            href="/painel"
            className="flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white"
          >
            Continuar para o painel (stub)
          </Link>
        </form>
      </div>
    </main>
  );
}
