"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/painel", label: "Início", match: (p: string) => p === "/painel" },
  {
    href: "/painel/pedidos",
    label: "Pedidos",
    match: (p: string) => p.startsWith("/painel/pedidos"),
  },
  {
    href: "/painel/livros",
    label: "Livros",
    match: (p: string) => p.startsWith("/painel/livros"),
  },
  {
    href: "/painel/relatorios",
    label: "Relatórios",
    match: (p: string) => p.startsWith("/painel/relatorios"),
  },
  {
    href: "/painel/loja#app-celular",
    label: "Loja",
    match: (p: string) => p.startsWith("/painel/loja"),
  },
] as const;

export function PainelMobileNav() {
  const pathname = usePathname() || "/painel";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação mobile"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[0.65rem] font-medium leading-tight ${
                  active ? "text-accent-text" : "text-muted"
                }`}
              >
                <span
                  className={`h-1 w-5 rounded-full ${
                    active ? "bg-accent" : "bg-transparent"
                  }`}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
