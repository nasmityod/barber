import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const display = Playfair_Display({ variable: "--font-display", subsets: ["latin"], style: ["normal", "italic"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "Corteza — Barbería, agenda y caja",
    description: "Agenda, sillas, caja y reservas online para barberías. Negro en el piso, oro en el cobro.",
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "Corteza", description: "Agenda, caja y reservas para barberías", images: [{ url: new URL("/og.png", base).toString(), width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Corteza", description: "Agenda, caja y reservas para barberías", images: [new URL("/og.png", base).toString()] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geist.variable} ${geistMono.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
