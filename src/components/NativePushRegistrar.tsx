'use client';

/**
 * NativePushRegistrar
 * -------------------
 * Runs ONLY inside the native Android/iOS app (Capacitor). It requests push
 * permission, registers the device with Firebase Cloud Messaging, and sends the
 * resulting token to the server (/api/device-tokens) so the backend can deliver
 * real-time notifications even when the app is closed. On the web / PWA this is
 * a no-op (the browser's own web-push path is used there).
 *
 * Everything is dynamically imported and guarded, so it never affects the web
 * bundle's first paint or SSR.
 */

import { useEffect } from 'react';

export default function NativePushRegistrar() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const core: any = await import('@capacitor/core').catch(() => null);
        const Capacitor = core?.Capacitor;
        if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) return;

        const mod: any = await import('@capacitor/push-notifications').catch(() => null);
        const PushNotifications = mod?.PushNotifications;
        if (!PushNotifications) return;

        // Ask for permission, then register with FCM/APNs.
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.register();

        // The device's FCM token — persist it on the server.
        PushNotifications.addListener('registration', async (t: { value: string }) => {
          if (cancelled || !t?.value) return;
          try {
            await fetch('/api/device-tokens', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                token: t.value,
                platform: Capacitor.getPlatform ? Capacitor.getPlatform() : 'android',
              }),
            });
          } catch { /* offline — will retry on next launch */ }
        });

        PushNotifications.addListener('registrationError', (e: any) => {
          console.warn('[push] registration error', e);
        });

        // Tapping a notification deep-links into the relevant page.
        PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action: any) => {
            const link = action?.notification?.data?.link;
            if (link && typeof link === 'string') {
              try { window.location.assign(link); } catch { /* ignore */ }
            }
          }
        );
      } catch (err) {
        console.warn('[push] native push setup skipped', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
