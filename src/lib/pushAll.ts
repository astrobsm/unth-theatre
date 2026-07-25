// Fire a push to BOTH channels at once:
//   • FCM  → the installed native (Capacitor) app's device tokens
//   • Web Push → installed PWAs / browsers (desktop + Android Chrome)
// Each no-ops when its channel isn't configured, so callers just call once.
import { sendPushToUsers as fcmUsers, sendPushToRoles as fcmRoles } from '@/lib/fcm';
import { sendWebPushToUsers as webUsers, sendWebPushToRoles as webRoles } from '@/lib/webpush';

export interface UnifiedPushPayload {
  title: string;
  body: string;
  url?: string;
  sound?: string;    // custom emergency clip name (native)
  priority?: string; // CRITICAL | HIGH | ...
  tag?: string;
  data?: Record<string, any>;
}

const toFcm = (p: UnifiedPushPayload) => ({
  title: p.title,
  body: p.body,
  link: p.url,
  sound: p.sound,
  priority: p.priority,
  tag: p.tag,
  // FCM data values must be strings.
  data: Object.fromEntries(Object.entries(p.data || {}).map(([k, v]) => [k, String(v)])),
});
const toWeb = (p: UnifiedPushPayload) => ({
  title: p.title, body: p.body, url: p.url, priority: p.priority, tag: p.tag, data: p.data,
});

export async function pushToUsers(userIds: string[], payload: UnifiedPushPayload): Promise<void> {
  if (!userIds.length) return;
  await Promise.allSettled([fcmUsers(userIds, toFcm(payload)), webUsers(userIds, toWeb(payload))]);
}

export async function pushToRoles(roles: string[], payload: UnifiedPushPayload): Promise<void> {
  if (!roles.length) return;
  await Promise.allSettled([fcmRoles(roles, toFcm(payload)), webRoles(roles, toWeb(payload))]);
}
