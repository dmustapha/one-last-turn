import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";

import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const SITE = "https://one-last-turn.vercel.app";
const TAGLINE = "One private boundary. One remembered response. One last turn.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "One Last Turn",
  description:
    "A finite post-appeal community handoff. A persistent Minds agent carries a private care boundary across two separate processes to complete one controlled returning-member response.",
  other: { "ory-verify": "orynth-2dc62884d1db4ae6949eec1e27d972cc" },
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "One Last Turn",
    description: TAGLINE,
    url: SITE,
    siteName: "One Last Turn",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "One Last Turn" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "One Last Turn",
    description: TAGLINE,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
