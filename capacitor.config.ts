import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration — wraps the LIVE PWA in native Android & iOS shells.
 *
 * The native apps simply load the deployed web app (server.url) inside a native
 * WebView, so:
 *   • The existing PWA is completely untouched.
 *   • Every web deploy instantly updates the mobile apps — no store re-submit.
 *   • Next.js SSR, API routes, NextAuth and the service worker all keep working.
 *
 * Override the URL for a staging/local build with the CAP_SERVER_URL env var,
 * e.g.  CAP_SERVER_URL=http://192.168.1.50:3000 npx cap run android
 */
const SERVER_URL = process.env.CAP_SERVER_URL || 'https://unth-theatre-mai.vercel.app';

const config: CapacitorConfig = {
  appId: 'ng.edu.unth.orm',
  appName: 'ORM - UNTH',
  // Local fallback assets (splash/offline). The app actually loads server.url.
  webDir: 'mobile-shell',
  backgroundColor: '#1e40af',
  server: {
    url: SERVER_URL,
    cleartext: SERVER_URL.startsWith('http://'), // only allow cleartext for local dev
    androidScheme: 'https',
    // Keep in-app navigation for the app's own domain(s); everything else opens
    // in the system browser.
    allowNavigation: [
      'unth-theatre-mai.vercel.app',
      '*.vercel.app',
    ],
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
