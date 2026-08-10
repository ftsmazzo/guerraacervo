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
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b border-line bg-sidebar-bg md:border-b-0 md:border-r md:border-line">
        <div className="flex h-[58px] items-center gap-2.5 border-b border-line px-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-accent text-sm font-semibold text-white">
            G
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.9rem] font-bold text-ink">
              GuerraAcervo
            </p>
            <p className="truncate text-[0.62rem] text-muted">Painel do sebo</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border-l-[3px] border-transparent px-3 py-2 text-[0.835rem] text-sidebar-text hover:bg-sidebar-hover hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-line px-5 py-4 md:block">
          <Link
            href="/admin"
            className="text-xs text-muted hover:text-accent-text"
          >
            Admin plataforma →
          </Link>
        </div>
      </aside>
      <div className="bg-background">
        <header className="flex h-[58px] items-center justify-between border-b border-line bg-card px-6">
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
