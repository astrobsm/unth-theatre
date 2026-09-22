// ============================================================
// Joining the theatre Wi-Fi without typing anything
// ------------------------------------------------------------
// WHAT A WEB PAGE CANNOT DO, said plainly because the request was for it: no
// browser can fill in a Wi-Fi password. Joining a network happens in the
// operating system's own network picker, before any page exists, and there is
// no API — on any platform — that lets a website put a password there. A page
// that claimed to would be a page that lied.
//
// WHAT ACTUALLY REMOVES THE TYPING is the Wi-Fi QR code. It is a real standard,
// read natively by the camera on iOS 11 and later and Android 10 and later:
// point, tap the banner, joined. No keyboard, no password read aloud across a
// theatre, no transposed digits. That is what this builds.
//
// WHERE THE CODE MAY BE SHOWN. Not on the captive portal, and not on any page
// reachable without signing in. The portal is served to anybody within range
// and, in the cloud, to the whole internet; printing the hospital's network
// password there would publish it. It belongs on a wall inside the theatre and
// on a screen a signed-in member of staff is already holding.
// ============================================================

/**
 * The networks this hospital runs for the theatre.
 *
 * Extenders that rebroadcast the same SSID need no entry — a phone treats them
 * as one network. Only an extender configured with a DIFFERENT name does, and
 * then its name has to be exact: a QR for a network that does not exist joins
 * nothing and tells the person nothing about why.
 */
export const THEATRE_SSIDS = [
  'UNTH-THEATRE-ORM',
  'UNTH-THEATRE-ORM-EXT',
  'UNTH-THEATRE-ORM-EXT2',
] as const;

export const PRIMARY_SSID = THEATRE_SSIDS[0];

/** Is this one of ours? Used to tell staff they are on the right network. */
export function isTheatreNetwork(ssid: string | null | undefined): boolean {
  const s = (ssid ?? '').trim().toUpperCase();
  return s.startsWith('UNTH-THEATRE-ORM');
}

/**
 * Escaping for the Wi-Fi QR payload.
 *
 * Backslash, semicolon, comma, colon and double quote are the payload's own
 * delimiters and must be escaped, or a password containing one produces a QR
 * that either fails to parse or — worse — parses into a different password and
 * fails to join with no explanation.
 */
export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export interface WifiQrInput {
  ssid: string;
  password: string;
  /** WPA covers WPA2 and WPA3, which is what this network uses. */
  security?: 'WPA' | 'WEP' | 'nopass';
  /** True only for a network that does not broadcast its name. */
  hidden?: boolean;
}

/**
 * The payload a camera reads to join a network.
 *
 * Format: WIFI:T:<security>;S:<ssid>;P:<password>;H:<hidden>;;
 * The trailing double semicolon terminates it and is not optional.
 */
export function wifiQrPayload(input: WifiQrInput): string {
  const security = input.security ?? 'WPA';
  const parts = [
    `T:${security}`,
    `S:${escapeWifiValue(input.ssid)}`,
    ...(security === 'nopass' ? [] : [`P:${escapeWifiValue(input.password)}`]),
    `H:${input.hidden ? 'true' : 'false'}`,
  ];
  return `WIFI:${parts.join(';')};;`;
}

/**
 * What a person is actually asked to do, in order.
 *
 * Written out rather than left to a diagram because the step people get wrong
 * is the one after joining: they wait for something to happen, nothing does,
 * and they decide the network is broken. The sign-in page does not always open
 * by itself, and knowing that in advance is the difference between waiting and
 * opening it.
 */
export const JOIN_STEPS: Array<{ step: string; detail: string }> = [
  {
    step: 'Point the camera at the code',
    detail: 'No app needed — the ordinary camera. A banner appears at the top; tap it.',
  },
  {
    step: 'Tap Join',
    detail: 'The password is already in it. Nothing to type.',
  },
  {
    step: 'The sign-in page should open by itself',
    detail: 'If it does not after a few seconds, open a browser and go to unth-theatre.link. '
      + 'Some phones need that nudge, and nothing is wrong when they do.',
  },
  {
    step: 'Sign in with your ORM username and password',
    detail: 'The same ones you use for the app. This opens the network and signs you into the '
      + 'app at the same time — you are not signing in twice.',
  },
  {
    step: 'The app opens and stays open',
    detail: 'It moves out of the small sign-in window into your normal browser, so it is still '
      + 'there when you come back to it.',
  },
];

/**
 * The one thing to say when it does not work.
 *
 * A troubleshooting list nobody can remember is no use at 3 a.m. This is the
 * single failure that accounts for most of them.
 */
export const COMMON_FAILURE = {
  symptom: 'Joined the network, but no sign-in page and nothing loads',
  cause: 'The phone is still holding the previous connection, or it joined and the portal '
    + 'never opened.',
  fix: 'Turn Wi-Fi off and on again, then open a browser and go to unth-theatre.link. '
    + 'If the sign-in page still does not appear, tell the theatre manager which phone it is — '
    + 'do not keep re-entering the password.',
};
