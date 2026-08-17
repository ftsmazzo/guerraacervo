"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type MobileNavItem = {
  href: string;
  label: string;
};

export function PainelMobileNav({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname() || "/painel";
  if (!items.length) return null;
  const cols =
    items.length >= 5 ? "grid-cols-5" : items.length === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <nav
      className="painel-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação mobile"
    >
      <ul className={`mx-auto grid max-w-lg ${cols}`}>
        {items.map((item) => {
          const path = item.href.split("#")[0];
          const active =
            path === "/painel"
              ? pathname === "/painel"
              : pathname.startsWith(path);
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
