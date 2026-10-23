/**
 * Who a role-based notification actually reaches.
 *
 * There are two transports — FCM for the native Android app, Web Push for
 * the PWA — and they disagreed about what a role MEANS.
 *
 *   Web Push resolved roles through the users table, filtered to APPROVED.
 *   FCM matched DeviceToken.userRole, a column written once when a device
 *   registers and never updated again.
 *
 * So the FCM copy of a role was a record of what somebody was on the day
 * they installed the app. A nurse promoted to theatre manager kept receiving
 * nurse alerts and none of the manager ones; a suspended account kept
 * receiving everything, because that column carries no status either. The
 * same alert reached a different set of people on a phone than on a laptop,
 * and nothing anywhere reported a discrepancy.
 *
 * Read from the source rather than executed: both functions need a database
 * and a live FCM credential. What is checked is the thing that was wrong —
 * that the two now answer the same question the same way.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const fcm = read('src/lib/fcm.ts');
const webpush = read('src/lib/webpush.ts');

/** The body of a named exported async function. */
function body(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`could not read the body of ${name}`);
}

describe('a role means the same thing on every device', () => {
  const fcmRoles = body(fcm, 'sendPushToRoles');
  const webRoles = body(webpush, 'sendWebPushToRoles');

  it('FCM resolves roles through the users table', () => {
    // THE BUG. It matched DeviceToken.userRole, frozen at registration.
    expect(fcmRoles).toMatch(/prisma\.user\.findMany/);
    expect(fcmRoles).not.toMatch(/userRole/);
  });

  it('web push resolves roles through the users table', () => {
    expect(webRoles).toMatch(/prisma\.user\.findMany/);
  });

  it('both exclude accounts that are not approved', () => {
    // A suspended or rejected account must stop receiving alerts. The
    // DeviceToken column carried no status at all, so FCM had no way to.
    for (const [name, src] of [['fcm', fcmRoles], ['webpush', webRoles]] as const) {
      expect(src, `${name} does not filter on APPROVED`).toMatch(/APPROVED/);
    }
  });

  it('both filter on the role column, not on a cached copy', () => {
    for (const [name, src] of [['fcm', fcmRoles], ['webpush', webRoles]] as const) {
      expect(src, `${name} does not filter on role`).toMatch(/role:\s*\{\s*in:/);
    }
  });
});

describe('what still makes a notification arrive on a closed phone', () => {
  it('FCM sends a notification block, not data alone', () => {
    // A data-only message is handed to the app, and a closed app cannot
    // display it. A notification block is rendered by Play Services whether
    // the app is running or not, which is the whole requirement.
    expect(fcm).toMatch(/notification:\s*\{\s*title:/);
  });

  it('asks Android to wake a dozing device', () => {
    expect(fcm).toMatch(/priority:\s*'HIGH'/);
    expect(fcm).toMatch(/PRIORITY_MAX/);
  });

  it('no-ops safely when the service account is absent', () => {
    // Every entry point checks, so an unconfigured server degrades to
    // in-app notifications rather than throwing on every alert.
    expect(body(fcm, 'sendPushToUsers')).toMatch(/isFcmConfigured\(\)/);
    expect(body(fcm, 'sendPushToRoles')).toMatch(/isFcmConfigured\(\)/);
  });
});
