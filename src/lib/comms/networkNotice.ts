// ============================================================
// The theatre Wi-Fi notice carried by every message we send staff
// ------------------------------------------------------------
// Theatre management asked for this on the bottom of every chase and every
// commendation. It is a reasonable place for it: those messages are already
// read, by exactly the people who need the network, and the commonest reason
// a duty is recorded late is that the person had no connection when they did
// the work.
//
// ONE DEFINITION. A network name that is right in four messages and wrong in
// the fifth sends people hunting for an SSID that does not exist, and they
// conclude the whole notice is stale.
//
// TWO THINGS ARE DELIBERATELY NOT AS DICTATED:
//
//   1. The SSID is UNTH-THEATRE-ORM, not UNTH-THEATHER-ORM. The name was
//      given to us with THEATRE transposed to THEATHER. The router does not
//      broadcast that, so every recipient would have searched for a network
//      that is not there -- and the ones who found the real one would trust
//      the next notice less. The name is taken from PRIMARY_SSID, which is
//      the same constant the QR code and the MikroTik config are built from,
//      so it cannot drift from the router again.
//
//   2. The Wi-Fi key is NOT printed here. "Your login is your ORM username
//      and password" is true of the captive portal, but the network is WPA2
//      and a key is needed to join the SSID before the portal appears. That
//      key is deliberately kept behind an app login -- see
//      src/lib/hotspot/wifi.ts on why the network is not open -- and putting
//      it in a WhatsApp message would publish it to every forwarded copy, in
//      a hospital where the same radio carries patient data. The notice
//      points at the page that holds it instead, which also has a QR code
//      that joins a phone in one tap.
// ============================================================

import { PRIMARY_SSID } from '@/lib/hotspot/wifi';

/** Where the key and the one-tap QR code live, behind the staff login. */
export const WIFI_PAGE = 'Dashboard → Theatre Wi-Fi';

/**
 * The notice, formatted for WhatsApp.
 *
 * Asterisks are WhatsApp's bold. The rules above and below are what make it
 * read as a separate notice rather than as another paragraph of the chase --
 * on a phone, an unseparated block at the end of a long message is simply not
 * seen.
 */
export const THEATRE_NETWORK_NOTICE = [
  '────────────────────',
  '*\u{1F4F6} THEATRE INTERNET — NOW FULLY OPTIMISED*',
  '',
  'The theatre network has been fully optimised and now covers the theatre '
    + 'complex. There is no longer a reason to leave an entry until you are off '
    + 'the ward.',
  '',
  `*Network name (SSID):* ${PRIMARY_SSID}`,
  '*Sign in with:* your ORM username and password — the same ones you use '
    + 'for this system. There is no separate Wi-Fi account to apply for.',
  '',
  `*To join the first time:* open ${WIFI_PAGE} on the app. The network key and `
    + 'a QR code that joins your phone in one tap are both there. The key is '
    + 'kept behind your login rather than sent out in messages, because this '
    + 'is the same network the theatre’s patient records travel on.',
  '',
  'Tick *“Keep this phone signed in to the Wi-Fi”* on the sign-in page '
    + 'and your handset will rejoin by itself whenever you are in range.',
  '────────────────────',
].join('\n');

/**
 * Append the notice to a finished message.
 *
 * Idempotent: a builder that already carries it, or a message composed from
 * two parts that each added it, is not given a second copy.
 */
export function withNetworkNotice(message: string): string {
  const body = (message || '').replace(/\s+$/, '');
  if (body.indexOf(PRIMARY_SSID) !== -1) return body;
  return `${body}\n\n${THEATRE_NETWORK_NOTICE}`;
}
