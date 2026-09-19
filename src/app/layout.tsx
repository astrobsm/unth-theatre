import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import ToasterProvider from "@/components/ToasterProvider";
import BlockerProvider from "@/components/blockers/BlockerProvider";
import InstallAppButton from "@/components/InstallAppButton";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ChunkErrorReloader from "@/components/ChunkErrorReloader";

// SELF-HOSTED, not next/font/google.
//
// next/font fetches the font at BUILD time. The theatre server is expected to
// build during an internet outage — that is most of the reason it exists — and
// on 18 September a build there failed on `Failed to fetch Inter from Google
// Fonts` after npm install cleared the font cache, leaving the app serving
// nothing until the font was brought into the repository.
//
// 48 KB of woff2 is a small price for a build that cannot be taken down by
// somebody else'''s CDN.
const inter = localFont({
  src: "./fonts/Inter-Variable-latin.woff2",
  display: "swap",
  variable: "--font-inter",
  // The variable font covers the whole range; naming it stops the browser
  // synthesising bold from the regular weight.
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Theatre Manager - UNTH Ituku Ozalla",
  description: "Theatre management system for University of Nigeria Teaching Hospital Ituku Ozalla",
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ORM - UNTH',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom is ALLOWED. It was disabled with maximumScale: 1 and
  // userScalable: false, which on Android genuinely prevents zooming — on a
  // clinical system where people read folder numbers, drug doses and pack
  // quantities off a phone, often in poor light and often without their
  // reading glasses. iOS has ignored the lock since iOS 10 precisely because
  // of the harm it does, so it was only ever taking the capability away from
  // Android users.
  //
  // The usual reason for locking it — stopping iOS zooming when a font-size is
  // under 16px on focus — is a styling problem and belongs in the styles.
  themeColor: '#1e40af',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ORM - UNTH" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={inter.className}>
        <ChunkErrorReloader />
        {/* Must be in the ROOT layout: a browser will not offer to install the
            app until a service worker is registered, and registration used to
            happen only inside the dashboard — never on the login screen, which
            is the one page an uninstalled visitor is guaranteed to see. */}
        <ServiceWorkerRegistrar />
        <Providers>{children}</Providers>
        <ToasterProvider />
        {/* Mounted ONCE, here, on purpose. The global fetch interceptor sees
            every mutation the application makes, so a refusal that can be
            explained is announced as a window event and picked up here —
            which is how every form in the system gets a way out of a block
            without any of them being edited. A second copy would show two
            dialogs for one refusal. */}
        <BlockerProvider />
        <InstallAppButton />
      </body>
    </html>
  );
}
