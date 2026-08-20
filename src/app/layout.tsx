import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import ToasterProvider from "@/components/ToasterProvider";
import InstallAppButton from "@/components/InstallAppButton";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ChunkErrorReloader from "@/components/ChunkErrorReloader";

const inter = Inter({ subsets: ["latin"] });

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
        <InstallAppButton />
      </body>
    </html>
  );
}
