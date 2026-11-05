import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Frédy · escritório virtual",
    template: "%s · Frédy",
  },
  description:
    "Escritório virtual da Frédy: a equipe caminha, se encontra e conversa por voz e vídeo, com salas de reunião privadas.",
  applicationName: "Frédy",
};

export const viewport: Viewport = {
  themeColor: "#0e1533",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
