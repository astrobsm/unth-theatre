'use client';

/**
 * PushNotificationRegistrar
 * -------------------------
 * Runs ONLY inside the installed native app (Capacitor). It:
 *   1. Requests notification permission.
 *   2. Registers the device with Firebase Cloud Messaging (FCM / APNs).
 *   3. Sends the device token to the server (/api/device-tokens) so the backend
 *      can deliver real-time push notifications even when the app is closed.
 *   4. Deep-links to the relevant page when a notification is tapped.
 *
 * On the web (PWA/browser) this component is a no-op — the existing web-push /
 * in-app notification systems keep working there. Everything is loaded via
 * dynamic import so the web bundle never pulls in native-only code.
 */

import { useEffect } from 'react';

export default function PushNotificationRegistrar() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor?.isNativePlatform?.()) return; // web → no-op

        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Ask for permission (Android 13+ / iOS require an explicit prompt).
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== 'granted') return;

        // Register the device token with our server.
        const onRegistration = async (token: { value: string }) => {
          try {
            await fetch('/api/device-tokens', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                token: token.value,
                platform: Capacitor.getPlatform(),
              }),
            });
          } catch {
            /* will retry on next app open */
          }
        };

        // Open the linked page when a push is tapped.
        const onTap = (action: any) => {
          const link = action?.notification?.data?.link;
          if (link && typeof link === 'string') {
            try {
              window.location.assign(link.startsWith('http') ? link : link);
            } catch {
              /* ignore */
            }
          }
        };

        const h1 = await PushNotifications.addListener('registration', onRegistration);
        const h2 = await PushNotifications.addListener('pushNotificationActionPerformed', onTap);
        const h3 = await PushNotifications.addListener('registrationError', (e: any) =>
          console.warn('[push] registration error', e)
        );

        await PushNotifications.register();

        cleanup = () => {
          try { h1.remove(); h2.remove(); h3.remove(); } catch { /* ignore */ }
        };
      } catch (err) {
        // Native plugin not available (web) or init failed — safe to ignore.
      }
    })();

    return () => cleanup?.();
  }, []);

  return null;
}
