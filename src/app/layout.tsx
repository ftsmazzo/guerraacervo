import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const brand = Inter({
  variable: "--font-brand",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GuerraAcervo",
  description: "Sistema SaaS para sebos e colecionadores de livros",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${brand.variable} antialiased`}>{children}</body>
    </html>
  );
}
