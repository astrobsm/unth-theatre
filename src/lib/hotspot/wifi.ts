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
 * The network. One name, everywhere in the theatre.
 *
 * Every extender rebroadcasts UNTH-THEATRE-ORM rather than a name of its own,
 * which is the right way round: a phone treats them as a single network and
 * roams between them without the person doing anything. It also means one code
 * on the wall instead of one per corridor, and nobody standing in front of the
 * wrong poster wondering why it will not join.
 *
 * Kept as a list because a hospital acquires a second network eventually — a
 * recovery area, a new wing — and the page already handles more than one.
 */
export const THEATRE_SSIDS = [
  'UNTH-THEATRE-ORM',
] as const;

export const PRIMARY_SSID = THEATRE_SSIDS[0];

/**
 * How the network is secured, and therefore what joining it involves.
 *
 * 'WPA'   — a password is required. The QR carries it, so it is still one tap,
 *           and the radio traffic is encrypted.
 * 'nopass' — an OPEN network. Tapping the name joins instantly and the captive
 *           portal appears with no password step at all. This is how hotel and
 *           airport Wi-Fi works and it is the least friction possible.
 *
 * WHY THIS IS STILL 'WPA'. On an open network nothing encrypts the radio, so
 * whatever the browser sends in clear is readable by anyone in range. The
 * theatre server has no TLS certificate yet, which means the ORM username and
 * password typed into the captive portal cross the air unencrypted — and that
 * is the password to a system holding patient records. WPA2 is currently the
 * only thing protecting them. scripts/local-server/README.md says so in terms.
 *
 * TO MAKE IT OPEN, one of these has to come first:
 *
 *   Put TLS on the theatre server. Then the portal is HTTPS, credentials are
 *   encrypted whatever the Wi-Fi does, and this can become 'nopass' safely.
 *   That is also what restores offline caching, offline sign-in and the
 *   presence geofence, all of which need a secure context and are degraded
 *   without it — so it is worth doing regardless of the Wi-Fi.
 *
 *   Or switch the SSID to WPA3 Enhanced Open (OWE). No password to join AND
 *   the radio is still encrypted. Supported by RouterOS and by most phones
 *   since about 2020; run it in transition mode so older handsets still
 *   connect. This gives exactly the behaviour wanted with none of the
 *   exposure, and needs no certificate.
 *
 * Changing this constant changes the QR, the instructions and the poster
 * together. Nothing else needs touching.
 */
export type WifiSecurity = 'WPA' | 'nopass';

export const WIFI_SECURITY = 'WPA' as WifiSecurity;

export const NETWORK_IS_OPEN: boolean = WIFI_SECURITY === 'nopass';

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
export const OPEN_NETWORK_STEPS: Array<{ step: string; detail: string }> = [
  {
    step: 'Tap UNTH-THEATRE-ORM in your Wi-Fi list',
    detail: 'There is no network password. It joins straight away.',
  },
  {
    step: 'The sign-in page opens by itself',
    detail: 'If it does not after a few seconds, open a browser and go to unth-theatre.link.',
  },
  {
    step: 'Sign in with your ORM username and password',
    detail: 'This opens the network and signs you into the app at the same time — you are not '
      + 'signing in twice.',
  },
  {
    step: 'The app opens and stays open',
    detail: 'It moves out of the small sign-in window into your normal browser, so it is still '
      + 'there when you come back to it.',
  },
];

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

/** The steps for however the network is currently secured. */
export const STEPS_FOR_NETWORK = NETWORK_IS_OPEN ? OPEN_NETWORK_STEPS : JOIN_STEPS;
