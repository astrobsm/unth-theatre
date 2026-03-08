import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'UNTH Emergency Theatre Display',
  description: 'Real-time emergency surgery display board for theatre wall screens and Android kiosk tablets',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function EmergencyDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Minimal layout — no sidebar, no header, no auth wrapper
  // Designed for wall-mounted TV screens and Android kiosk tablets
  return <>{children}</>;
}
