// ============================================================
// Devices that may stay on the theatre Wi-Fi
// ------------------------------------------------------------
// The request was plain: staff should sign in to the network once and have
// their phone rejoin by itself from then on, rather than meeting the portal
// every morning. What follows is the part of that which is ours to decide.
//
// WHAT ACTUALLY MAKES A PHONE REJOIN SILENTLY, because it is not obvious and
// the answer is not in this file:
//
//   1. The handset rejoins the SSID on its own. That is the operating system,
//      not us — a saved network, nothing a web page can influence.
//   2. The router recognises the device and does not show the portal. That is
//      MikroTik's MAC cookie, and its lifetime is `mac-cookie-timeout` on the
//      hotspot USER PROFILE. It is the only setting that decides how long a
//      device is remembered for.
//
// Because (2) lives on a profile, "remember this device" and "do not" have to
// be two profiles, and the choice is made by naming one in the RADIUS reply.
// A row here is what that choice is read from. See radius-bridge.ts.
//
// WHY A ROW AT ALL, rather than letting the router remember everything. Three
// reasons, and the first is the one that matters in a hospital:
//
//   - It can be taken back. A handset that walks out of the theatre is
//     revoked here, in a table, by the person who lost it — not by somebody
//     finding Winbox and the right menu.
//   - It expires. "Permanently" in a building with staff turnover means
//     "until somebody notices", so the enrolment has an end date that every
//     sign-in pushes forward. A device that stops appearing stops being
//     trusted, without anybody having to remember to do anything.
//   - It is a record. Which phone, whose, since when, last seen. The router's
//     cookie table says none of that and is lost on a reboot.
//
// WHAT THIS IS NOT. It is not a clinical identity. Recognising a handset says
// the device was authorised, never that a particular nurse is holding it —
// eight phones are shared between ten people here, and one MAC has signed in
// as two different nurses five hours apart. The ORM application keeps its own
// login and its own roles, and nothing in this file touches them.
//
// Pure, so the rules can be proved without a router or a database.
// ============================================================

/**
 * How long an enrolment lasts before the portal is shown again.
 *
 * Ninety days is "permanent" as a hospital can honestly offer it: long enough
 * that nobody on a normal rota ever meets the portal twice, short enough that
 * a handset which left the building a term ago is no longer trusted by it.
 *
 * EVERY SUCCESSFUL SIGN-IN PUSHES IT FORWARD, so a phone in daily use is never
 * asked again. The clock only runs down on a device that has stopped coming.
 */
export const REMEMBER_DAYS = 90;

/**
 * How long one granted network session lasts.
 *
 * Unchanged for a device nobody asked to remember: a full working day plus the
 * changeover either side of it.
 */
export const SESSION_SECONDS = 24 * 60 * 60;

/**
 * And for a remembered one: a week, not a year.
 *
 * The session timeout is NOT what makes a phone rejoin silently — the MAC
 * cookie is — so there is nothing to buy by making this enormous, and a
 * reauthentication is the only moment the bridge gets to check that the
 * account still exists, is still approved, and has not been revoked here. A
 * year-long session would mean a dismissed member of staff kept the network
 * for a year. A week means that check happens often enough to matter and
 * rarely enough that nobody notices it.
 */
export const REMEMBERED_SESSION_SECONDS = 7 * 24 * 60 * 60;

/**
 * The two hotspot user profiles, by name.
 *
 * Created by deploy/mikrotik/hotspot-setup.rsc. The bridge names one of them
 * in its reply; if the names here and the names on the router ever disagree,
 * the router refuses the login — which is why they are constants in one file
 * rather than strings typed in two.
 */
export const PROFILE_REMEMBERED = 'orm-remembered';
export const PROFILE_ONE_VISIT = 'orm-one-visit';

/**
 * A MAC address in the one form everything here compares.
 *
 * MikroTik writes it as `A4:B1:C2:D3:E4:F5` in the portal URL and sends the
 * same in Calling-Station-Id, but routers, phones and people write MACs in at
 * least four ways. Comparing them as typed is how an enrolment made from the
 * portal fails to match the RADIUS request for the very same handset — the
 * device is remembered, in a row nothing will ever find.
 *
 * Returns null for anything that is not twelve hex digits, so a missing or
 * malformed value can never be stored as though it identified something.
 */
export function normaliseMac(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  // All zeroes is what a router sends when it does not know, not a device.
  if (hex === '000000000000') return null;
  return (hex.match(/.{2}/g) as string[]).join(':');
}

/** The stored shape this module reasons about. A subset of the Prisma row. */
export interface EnrolledDevice {
  mac: string;
  userId: string;
  remembered: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Is this device to be kept on the network?
 *
 * Three ways to lose it, and they are deliberately separate: the person
 * unticked the box, somebody revoked it, or it simply stopped coming. An
 * operator reading the row can tell which.
 */
export function isRemembered(
  device: EnrolledDevice | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!device) return false;
  if (!device.remembered) return false;
  if (device.revokedAt) return false;
  return device.expiresAt.getTime() > now.getTime();
}

/** When an enrolment made or renewed now would run out. */
export function expiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + REMEMBER_DAYS * 24 * 60 * 60 * 1000);
}

/** What the RADIUS reply should say for this device. */
export interface NetworkGrant {
  sessionSeconds: number;
  profile: string;
  remembered: boolean;
}

export function grantFor(
  device: EnrolledDevice | null | undefined,
  now: Date = new Date(),
): NetworkGrant {
  return isRemembered(device, now)
    ? {
      sessionSeconds: REMEMBERED_SESSION_SECONDS,
      profile: PROFILE_REMEMBERED,
      remembered: true,
    }
    : {
      // Unchanged from before any of this existed, which is the point: a
      // person who does not opt in gets exactly what they got yesterday.
      sessionSeconds: SESSION_SECONDS,
      profile: PROFILE_ONE_VISIT,
      remembered: false,
    };
}

/**
 * Something recognisable in a list of this person's devices.
 *
 * A MAC address tells nobody which phone is theirs. A model read out of the
 * user-agent is imperfect — it says "Android phone" for half the hospital — so
 * the last four hex digits are kept beside it, which is what IT reads out when
 * somebody has to point at a handset.
 */
export function deviceLabel(userAgent: string | null | undefined, mac: string): string {
  const tail = mac.slice(-5).replace(':', '');
  const ua = userAgent ?? '';
  let make = 'Device';
  if (/iPhone/i.test(ua)) make = 'iPhone';
  else if (/iPad/i.test(ua)) make = 'iPad';
  else if (/Android/i.test(ua)) {
    // Android user-agents carry the model between "; " and either ")" or
    // " Build/". It is the only part a person recognises as their own phone.
    const m = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|\))/i.exec(ua);
    make = m && m[1].trim() ? m[1].trim() : 'Android phone';
  } else if (/Windows/i.test(ua)) make = 'Windows computer';
  else if (/Macintosh|Mac OS X/i.test(ua)) make = 'Mac';
  return `${make} · ${tail}`;
}

/** "3 February 2027" in Enugu — what the person is actually being promised. */
export function rememberedUntil(expiresAt: Date): string {
  return expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos',
  });
}
