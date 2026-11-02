/**
 * RADIUS -> ORM bridge
 * ============================================================================
 * Answers the MikroTik hotspot's "may this person join the network?" using the
 * ORM database, so staff have ONE identity and ONE password for the Wi-Fi and
 * the application. No password is ever copied into the router.
 *
 * Run it on the local server:
 *
 *     RADIUS_SECRET=... RADIUS_NAS=192.168.88.1 npx tsx scripts/local-server/radius-bridge.ts
 *
 * or install it as a service with ./install-radius-bridge.sh
 *
 * DESIGN NOTES THAT MATTER
 *
 * bcrypt is deliberately slow, and RADIUS is a UDP protocol with a short
 * timeout. A hash takes roughly 100ms while MikroTik's default RADIUS timeout
 * is 300ms, so the router must be configured with a longer timeout (the
 * install script prints the command). Retransmissions are also expected, so
 * identical in-flight requests share one answer rather than hashing twice —
 * without that, three retries mean three bcrypts and the queue never drains.
 *
 * The socket accepts datagrams from anything on the network. Requests are
 * therefore restricted to known NAS addresses, malformed packets are dropped
 * silently, and no reply ever distinguishes "no such user" from "wrong
 * password" at the protocol level — the Reply-Message is for the operator
 * reading logs, not for an attacker enumerating staff.
 */

import dgram from 'dgram';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import {
  ACCESS_ACCEPT,
  ACCESS_REJECT,
  ACCESS_REQUEST,
  ATTR_CALLING_STATION_ID,
  ATTR_MESSAGE_AUTHENTICATOR,
  ATTR_REPLY_MESSAGE,
  ATTR_SESSION_TIMEOUT,
  ATTR_USER_NAME,
  ATTR_USER_PASSWORD,
  MIKROTIK_GROUP,
  VENDOR_MIKROTIK,
  attribute,
  decodePacket,
  decryptUserPassword,
  encodeResponse,
  getAttribute,
  getString,
  verifyMessageAuthenticator,
  vendorAttribute,
} from '../../src/lib/radius/packet';
import { expiryFrom, grantFor, normaliseMac } from '../../src/lib/hotspot/devices';
import {
  failureMessage,
  verifyStaffCredentials,
  type CredentialDeps,
} from '../../src/lib/staffCredentials';

const PORT = Number(process.env.RADIUS_PORT || 1812);
const SECRET = process.env.RADIUS_SECRET || '';
/** Comma-separated list of routers allowed to ask. Empty means "any", which is refused below. */
const NAS_ALLOW = (process.env.RADIUS_NAS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/**
 * How long a granted network session lasts before the portal is shown again.
 *
 * A full working day plus the changeover either side of it. Twelve hours put
 * the expiry in the middle of a long list: somebody who authenticated at seven
 * in the morning was asked to log in again at seven in the evening, while still
 * in theatre.
 *
 * The default rather than the environment variable carries this, deliberately.
 * .env.local is rebuilt by setup-local-db.sh, and a setting that only exists
 * there returns silently to twelve hours the next time that happens — with
 * nothing to show that it had.
 */
const SESSION_TIMEOUT_SECONDS = Number(process.env.RADIUS_SESSION_TIMEOUT || 24 * 60 * 60);

/**
 * Whether to name a hotspot user profile in the reply.
 *
 * OFF UNLESS THE ROUTER HAS BEEN SET UP FOR IT, and that is the whole reason
 * this switch exists. Mikrotik-Group names a profile; a name the router does
 * not have is not ignored, it is a REJECTED LOGIN. A bridge upgraded ahead of
 * its router would therefore take the entire theatre off the Wi-Fi, which is
 * a worse fault than the one being fixed.
 *
 * deploy/mikrotik/hotspot-setup.rsc creates both profiles and
 * install-radius-bridge.sh sets this, so the two move together. Unset, every
 * session behaves exactly as it did before any of this was written.
 */
const PROFILES_READY = /^(1|true|yes)$/i.test(process.env.RADIUS_HOTSPOT_PROFILES || '');

if (!SECRET) {
  console.error('RADIUS_SECRET is not set. Refusing to start: an empty shared secret');
  console.error('would let anything on the network authenticate staff.');
  process.exit(1);
}
if (NAS_ALLOW.length === 0) {
  console.error('RADIUS_NAS is not set. Refusing to start: set it to the router address');
  console.error('(for example RADIUS_NAS=192.168.88.1) so only the hotspot may ask.');
  process.exit(1);
}

const prisma = new PrismaClient();

const deps: CredentialDeps = {
  findByUsername: (username) =>
    prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } }),
  findByPhoneSuffix: (last10) =>
    prisma.user.findMany({ where: { phoneNumber: { endsWith: last10 } } }),
  comparePassword: (plain, hash) => bcrypt.compare(plain, hash),
};

/**
 * Requests being processed, keyed by sender + identifier + authenticator.
 *
 * UDP retransmissions are normal, and bcrypt is slow enough that a retry
 * always arrives mid-hash. Sharing the promise means one hash per attempt
 * however many copies of the datagram turn up.
 */
const inFlight = new Map<string, Promise<Buffer>>();

const socket = dgram.createSocket('udp4');

socket.on('message', (msg, rinfo) => {
  if (!NAS_ALLOW.includes(rinfo.address)) {
    // Not an error worth logging loudly — port scanners find 1812 routinely.
    return;
  }

  const packet = decodePacket(msg);
  if (!packet || packet.code !== ACCESS_REQUEST) return;

  if (!verifyMessageAuthenticator(msg, packet, SECRET)) {
    console.warn(`[radius] bad Message-Authenticator from ${rinfo.address} — wrong shared secret?`);
    return;
  }

  const key = `${rinfo.address}:${packet.identifier}:${packet.authenticator.toString('hex')}`;
  const existing = inFlight.get(key);
  if (existing) {
    existing.then((reply) => socket.send(reply, rinfo.port, rinfo.address)).catch(() => {});
    return;
  }

  const work = handle(packet, msg)
    .catch((err) => {
      console.error('[radius] error handling request:', err?.message ?? err);
      return reject(packet, 'Service error. Try again.');
    })
    .finally(() => {
      // Kept briefly so late retransmissions still coalesce, then released.
      setTimeout(() => inFlight.delete(key), 5000).unref?.();
    });

  inFlight.set(key, work);
  work.then((reply) => socket.send(reply, rinfo.port, rinfo.address)).catch(() => {});
});

async function handle(packet: ReturnType<typeof decodePacket>, raw: Buffer): Promise<Buffer> {
  if (!packet) return Buffer.alloc(0);

  const username = getString(packet, ATTR_USER_NAME);
  const encrypted = getAttribute(packet, ATTR_USER_PASSWORD);
  const mac = getString(packet, ATTR_CALLING_STATION_ID) ?? 'unknown';

  if (!username || !encrypted) return reject(packet, 'Enter your username and password.');

  const password = decryptUserPassword(encrypted, SECRET, packet.authenticator);
  if (password === null) {
    // A malformed User-Password means the shared secret does not match, or the
    // hotspot is configured for CHAP. Both are setup faults, so say so.
    console.warn('[radius] could not decrypt User-Password — check the shared secret, and that');
    console.warn('         the hotspot profile uses PAP rather than CHAP.');
    return reject(packet, 'Network login is misconfigured. Tell IT.');
  }

  const result = await verifyStaffCredentials(deps, username, password);

  if (!result.ok) {
    console.log(`[radius] REJECT ${username} (${mac}) — ${result.reason}`);
    return reject(packet, failureMessage(result.reason));
  }

  // Does this person want this handset kept on the network?
  //
  // The row was written by the captive portal in the moment between the app
  // sign-in and the browser leaving for the router, so by the time this
  // request arrives it is already there. On every reconnection afterwards —
  // when there is no browser involved at all, because the router is using its
  // own cookie — this is the only place the choice is read.
  const grant = await rememberedGrant(normaliseMac(mac), result.user.id);

  console.log(
    `[radius] ACCEPT ${result.user.username} — ${result.user.role} (${mac})`
    + `${grant.remembered ? ' [kept signed in]' : ''}`,
  );

  // RADIUS_SESSION_TIMEOUT still governs the ordinary case, so an operator who
  // set it has not quietly had it overridden; the longer figure applies only
  // to a device somebody asked to be remembered.
  const seconds = grant.remembered ? grant.sessionSeconds : SESSION_TIMEOUT_SECONDS;
  const attributes = [attribute(ATTR_SESSION_TIMEOUT, seconds)];
  // The profile is what carries mac-cookie-timeout, and mac-cookie-timeout is
  // the single setting that decides how long the router recognises a device
  // for. Everything else here is bookkeeping around that one attribute.
  if (PROFILES_READY) {
    attributes.push(vendorAttribute(VENDOR_MIKROTIK, MIKROTIK_GROUP, grant.profile));
  }

  return encodeResponse({
    code: ACCESS_ACCEPT,
    identifier: packet.identifier,
    requestAuthenticator: packet.authenticator,
    secret: SECRET,
    includeMessageAuthenticator: hasMessageAuthenticator(packet),
    attributes,
  });
}

/**
 * Read — and renew — this device's enrolment.
 *
 * RENEWING ON EVERY SIGN-IN is what makes ninety days mean "for as long as you
 * keep coming". A phone in daily use never reaches its expiry; one that
 * stopped appearing in October is a stranger again in January, with nobody
 * having had to notice or do anything.
 *
 * A DATABASE PROBLEM MUST NOT BECOME A WI-FI PROBLEM. Every failure here
 * falls back to the ordinary one-day session, which is what everybody had
 * before this feature existed. Somebody who cannot be recognised should be
 * asked to sign in, not refused.
 */
async function rememberedGrant(mac: string | null, userId: string) {
  if (!mac) return grantFor(null);
  try {
    const device = await prisma.hotspotDevice.findUnique({ where: { mac } });
    const grant = grantFor(device);

    if (grant.remembered) {
      await prisma.hotspotDevice.update({
        where: { mac },
        data: {
          lastSeenAt: new Date(),
          expiresAt: expiryFrom(),
          // The handset now belongs to whoever just proved who they are. A
          // shared phone follows its last user, exactly as the router's own
          // cookie does, so the two can never disagree about whose it is.
          userId,
        },
      });
    }
    return grant;
  } catch (err) {
    console.warn('[radius] could not read the device enrolment:', (err as Error)?.message ?? err);
    return grantFor(null);
  }
}

function reject(packet: NonNullable<ReturnType<typeof decodePacket>>, message: string): Buffer {
  return encodeResponse({
    code: ACCESS_REJECT,
    identifier: packet.identifier,
    requestAuthenticator: packet.authenticator,
    secret: SECRET,
    includeMessageAuthenticator: hasMessageAuthenticator(packet),
    attributes: [attribute(ATTR_REPLY_MESSAGE, message)],
  });
}

function hasMessageAuthenticator(packet: NonNullable<ReturnType<typeof decodePacket>>): boolean {
  return packet.attributes.some((a) => a.type === ATTR_MESSAGE_AUTHENTICATOR);
}

socket.on('error', (err) => {
  console.error('[radius] socket error:', err.message);
  process.exit(1);
});

socket.bind(PORT, () => {
  console.log(`[radius] listening on udp/${PORT}`);
  console.log(`[radius] accepting requests from: ${NAS_ALLOW.join(', ')}`);
  console.log(`[radius] session timeout: ${SESSION_TIMEOUT_SECONDS}s`);
  console.log(
    PROFILES_READY
      ? '[radius] remembered devices: ON (naming hotspot profiles in the reply)'
      : '[radius] remembered devices: OFF — set RADIUS_HOTSPOT_PROFILES=1 once the'
        + ' router has the orm-remembered / orm-one-visit profiles',
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[radius] ${signal} — shutting down`);
    socket.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
}
