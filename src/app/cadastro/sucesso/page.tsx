import Link from "next/link";

export default function CadastroSucessoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-accent-text">PrismaBook</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Conta em criação</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Se o pagamento/trial foi confirmado, provisionamos sua conta em segundos.
        Você receberá um e-mail com o link de acesso e uma mensagem no WhatsApp
        do dono. Guarde o e-mail e a senha definidos no cadastro.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Ir para o login
        </Link>
        <Link
          href="/"
          className="rounded-md border border-line bg-card px-4 py-2.5 text-sm font-medium"
        >
          Página inicial
        </Link>
      </div>
    </main>
  );
}
