import { Suspense } from "react";
import { CadastroForm } from "./cadastro-form";

export default function CadastroPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-line bg-card px-6 py-4">
        <p className="text-lg font-semibold text-ink">GuerraAcervo</p>
        <p className="text-xs text-muted">Cadastro Negócio</p>
      </header>
      <Suspense fallback={<p className="p-6 text-sm text-muted">Carregando…</p>}>
        <CadastroForm />
      </Suspense>
    </main>
  );
}
