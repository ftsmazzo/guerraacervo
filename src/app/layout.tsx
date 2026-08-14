import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Outfit } from "next/font/google";
import "./globals.css";

const brand = Inter({
  variable: "--font-brand",
  subsets: ["latin"],
});

const landingDisplay = Outfit({
  variable: "--font-landing-display",
  subsets: ["latin"],
});

const landingSans = Manrope({
  variable: "--font-landing-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PrismaBook",
  description:
    "Sistema para sebos: catálogo, WhatsApp e vendas — planos Negócio com trial de 14 dias.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PrismaBook",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/prismabook-icon.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/prismabook-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1a2f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
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
