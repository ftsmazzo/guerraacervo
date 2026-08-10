import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scanner GuerraAcervo",
  description: "Leitura de ISBN ou capa para o computador",
  robots: "noindex",
};

export default function MobileScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mobile-scan-root">
      {children}
    </div>
  );
}
