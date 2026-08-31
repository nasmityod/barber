import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0c0e",
};

const TITLE = "787 Barber Studio — Gestión y reservas";
const DESCRIPTION = "Agenda, turno del día, caja y reservas online de 787 Barber Studio.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const image = new URL("/brand/787-og.png", base).toString();
  return {
    metadataBase: base,
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "787 Barber Studio",
    icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], apple: "/brand/787-icon.svg" },
    openGraph: {
      type: "website",
      siteName: "787 Barber Studio",
      title: TITLE,
      description: DESCRIPTION,
      locale: "es_VE",
      images: [{ url: image, width: 1200, height: 630, alt: "787 Barber Studio" }],
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geist.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
