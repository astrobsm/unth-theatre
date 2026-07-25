// ============================================================
// Web Push (PWA / browser) sender — VAPID
// ------------------------------------------------------------
// Delivers push to installed PWAs and browsers (desktop + Android Chrome) via
// the standard Web Push protocol, so notifications arrive even when the tab/app
// is CLOSED (the service worker's `push` handler shows them). This is separate
// from FCM (src/lib/fcm.ts), which targets the native Capacitor app's device
// tokens. Both are fired together by src/lib/pushAll.ts.
//
// No-ops safely unless VAPID keys are configured:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (+ optional VAPID_SUBJECT).
// Generate a keypair once with:  npx web-push generate-vapid-keys
// ============================================================
import prisma from '@/lib/prisma';

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  priority?: string; // CRITICAL | HIGH | ... — drives urgency + SW emphasis
  tag?: string;
  data?: Record<string, any>;
}

let vapidReady: any | null = null;
async function getWebPush(): Promise<any | null> {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  if (vapidReady) return vapidReady;
  try {
    const mod: any = await import('web-push');
    const webpush = mod.default ?? mod;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:theatre@unth.edu.ng', pub, priv);
    vapidReady = webpush;
    return webpush;
  } catch (e) {
    console.error('[webpush] init failed', e);
    return null;
  }
}

export function isWebPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendWebPushToUsers(userIds: string[], payload: WebPushPayload): Promise<void> {
  if (!userIds.length) return;
  const webpush = await getWebPush();
  if (!webpush) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (!subs.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    priority: payload.priority,
    tag: payload.tag,
    ...(payload.data || {}),
  });
  const urgent = payload.priority === 'CRITICAL' || payload.priority === 'URGENT' || payload.priority === 'HIGH';
  const options = { TTL: 3600, urgency: urgent ? 'high' : 'normal' as any };

  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint); // gone — prune
      }
    }),
  );
  if (dead.length) {
    try { await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }); } catch { /* ignore */ }
  }
}

export async function sendWebPushToRoles(roles: string[], payload: WebPushPayload): Promise<void> {
  if (!roles.length) return;
  const users = await prisma.user.findMany({ where: { role: { in: roles as any }, status: 'APPROVED' as any }, select: { id: true } });
  await sendWebPushToUsers(users.map((u) => u.id), payload);
}
