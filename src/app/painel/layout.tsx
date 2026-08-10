import Link from "next/link";

const nav = [
  { href: "/painel", label: "Dashboard" },
  { href: "/painel/livros", label: "Livros" },
  { href: "/painel/clientes", label: "Clientes" },
  { href: "/painel/pedidos", label: "Pedidos" },
  { href: "/painel/relatorios", label: "Relatórios" },
  { href: "/painel/loja", label: "Loja" },
];

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-ink text-white md:border-b-0 md:border-r md:border-line">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold">GuerraAcervo</p>
          <p className="text-xs text-white/55">Painel do sebo</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 md:block">
          <Link href="/admin" className="text-xs text-white/50 hover:text-white">
            Admin plataforma →
          </Link>
        </div>
      </aside>
      <div className="bg-background">
        <header className="flex items-center justify-between border-b border-line bg-card px-6 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Sebo Demo</p>
            <p className="text-xs text-muted">Plano: trial · 7 dias</p>
          </div>
          <Link href="/" className="text-sm text-muted hover:text-ink">
            Sair
          </Link>
        </header>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
