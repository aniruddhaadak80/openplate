import type { Metadata } from "next";
import { Bodoni_Moda, Geist_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { SITE, siteUrl } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Type pairing.
 *
 * A didone for display because a Bodoni is the face of printed matter and this
 * product is about printed matter; a plain grotesque for reading, because the
 * thing people read here is arithmetic; a mono for every figure and slug line,
 * so any number that changes is set in the same width as the one before it.
 */
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "public domain images",
    "image rights clearance",
    "copyright term",
    "CC0",
    "museum open access",
    "credit line",
    "MCP",
  ],
  authors: [{ name: SITE.author, url: siteUrl() }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl(),
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${publicSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bench-wash">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-review focus:bg-room focus:px-4 focus:py-2 focus:text-bone"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
