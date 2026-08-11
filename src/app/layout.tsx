import type { Metadata } from "next";
import { Fraunces, Inter, Manrope } from "next/font/google";
import "./globals.css";

const brand = Inter({
  variable: "--font-brand",
  subsets: ["latin"],
});

const landingDisplay = Fraunces({
  variable: "--font-landing-display",
  subsets: ["latin"],
});

const landingSans = Manrope({
  variable: "--font-landing-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GuerraAcervo",
  description:
    "Sistema para sebos: catálogo, WhatsApp e vendas — planos Negócio com trial de 14 dias.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${brand.variable} ${landingDisplay.variable} ${landingSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
