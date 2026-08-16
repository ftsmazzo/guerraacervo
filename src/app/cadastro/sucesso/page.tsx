import Link from "next/link";

export default function CadastroSucessoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-accent-text">PrismaBook</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Conta pronta</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        O teste de 14 dias já está ativo, sem cartão. Entre com o e-mail e a senha
        definidos no cadastro. Quando quiser continuar, escolha o pagamento em
        Assinatura.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/painel"
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Ir para o painel
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-line bg-card px-4 py-2.5 text-sm font-medium"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
