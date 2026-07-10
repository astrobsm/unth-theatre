// ============================================================
// Firebase Cloud Messaging (FCM) sender — HTTP v1 API
// ------------------------------------------------------------
// Delivers real-time push notifications to the installed native apps (Android /
// iOS) even when they are closed. Uses a Google service account (set as the
// FCM_SERVICE_ACCOUNT env var — the full service-account JSON) and signs the
// OAuth2 JWT with Node's built-in crypto, so no extra dependency is required.
//
// Everything here safely NO-OPS when FCM_SERVICE_ACCOUNT is not configured, so
// the app keeps working normally until Firebase is set up.
// ============================================================
import crypto from 'crypto';
import prisma from '@/lib/prisma';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedToken: { value: string; exp: number } | null = null;

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (sa.project_id && sa.client_email && sa.private_key) return sa;
  } catch {
    console.error('[fcm] FCM_SERVICE_ACCOUNT is not valid JSON');
  }
  return null;
}

export function isFcmConfigured(): boolean {
  return getServiceAccount() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Mint (and cache) a short-lived OAuth2 access token for the FCM scope.
async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = base64url(signer.sign(sa.private_key.replace(/\\n/g, '\n')));
  const jwt = `${unsigned}.${signature}`;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      console.error('[fcm] token exchange failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    cachedToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
    return cachedToken.value;
  } catch (err) {
    console.error('[fcm] token exchange error', err);
    return null;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Deep-link path opened when the notification is tapped (e.g. /dashboard/emergency-alerts). */
  link?: string;
}

// Low-level: send one message to one token. Returns false on a permanent
// failure (so the caller can prune dead tokens).
async function sendToToken(
  sa: ServiceAccount,
  accessToken: string,
  token: string,
  payload: PushPayload
): Promise<{ ok: boolean; prune: boolean }> {
  const message = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { ...(payload.data || {}), ...(payload.link ? { link: payload.link } : {}) },
      android: {
        priority: 'HIGH',
        notification: { sound: 'default', channelId: 'orm_alerts' },
      },
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    },
  };
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );
    if (res.ok) return { ok: true, prune: false };
    // 404 / 400 UNREGISTERED means the token is dead — prune it.
    const prune = res.status === 404 || res.status === 400;
    console.warn('[fcm] send failed', res.status);
    return { ok: false, prune };
  } catch (err) {
    console.error('[fcm] send error', err);
    return { ok: false, prune: false };
  }
}

async function sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  const sa = getServiceAccount();
  if (!sa || tokens.length === 0) return;
  const accessToken = await getAccessToken(sa);
  if (!accessToken) return;

  const dead: string[] = [];
  // Send with light concurrency.
  await Promise.all(
    tokens.map(async (t) => {
      const { prune } = await sendToToken(sa, accessToken, t, payload);
      if (prune) dead.push(t);
    })
  );
  if (dead.length) {
    try {
      await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    } catch { /* ignore */ }
  }
}

/** Push to specific users' devices (no-op if FCM isn't configured). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!isFcmConfigured() || userIds.length === 0) return;
  try {
    const rows = await prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    await sendToTokens(rows.map((r) => r.token), payload);
  } catch (err) {
    console.error('[fcm] sendPushToUsers error', err);
  }
}

/** Push to every device whose owner has one of the given roles. */
export async function sendPushToRoles(roles: string[], payload: PushPayload): Promise<void> {
  if (!isFcmConfigured() || roles.length === 0) return;
  try {
    const rows = await prisma.deviceToken.findMany({
      where: { userRole: { in: roles } },
      select: { token: true },
    });
    await sendToTokens(rows.map((r) => r.token), payload);
  } catch (err) {
    console.error('[fcm] sendPushToRoles error', err);
  }
}

/** Push to ALL registered devices (use sparingly — e.g. hospital-wide emergency). */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!isFcmConfigured()) return;
  try {
    const rows = await prisma.deviceToken.findMany({ select: { token: true } });
    await sendToTokens(rows.map((r) => r.token), payload);
  } catch (err) {
    console.error('[fcm] sendPushToAll error', err);
  }
}
