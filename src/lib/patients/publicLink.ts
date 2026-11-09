// ============================================================
// Links that have to work on a patient's own phone
// ------------------------------------------------------------
// A link in a staff message can be whatever host the staff member is already
// on. A link in a PATIENT message cannot, and this is the whole reason this
// file exists separately from everywhere else that builds a URL.
//
// ORM runs on two nodes. The theatre server answers on a Tailscale address
// reachable only from inside the hospital's own tailnet; the cloud node answers
// on the public name. A nurse standing in theatre is very often on the first
// one. Build a patient's feedback link from `request.headers.host` the way the
// password-reset route reasonably does, and the message that goes to a
// patient's phone carries `http://100.85.215.54:3000/f` — a link that cannot
// resolve from a phone on mobile data, that gives no error worth the name, and
// that makes the hospital look as though it is asking for feedback it does not
// want.
//
// So: never the request host. An environment value if one is set, otherwise the
// public name, and a private address is rejected even when it IS the configured
// value — because the failure it causes is silent and lands on the patient.
// ============================================================

/** Where patients reach ORM from outside the hospital. */
export const PUBLIC_SITE_FALLBACK = 'https://unth-theatre.link';

/**
 * Hosts that exist only inside the hospital or on the machine itself.
 *
 * Tailscale's 100.64.0.0/10 is the one that actually bites here: it looks like
 * an ordinary public address and is not one.
 */
function isUnreachableFromAPhone(host: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '127.0.0.1' || h.startsWith('127.')) return true;
  if (h.startsWith('10.') || h.startsWith('192.168.')) return true;
  // 172.16.0.0 – 172.31.255.255
  const m172 = /^172\.(\d{1,3})\./.exec(h);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  // 100.64.0.0/10 — Tailscale and carrier-grade NAT.
  const m100 = /^100\.(\d{1,3})\./.exec(h);
  if (m100 && Number(m100[1]) >= 64 && Number(m100[1]) <= 127) return true;
  return false;
}

/**
 * The site root to put in front of a patient, with no trailing slash.
 *
 * Takes no request on purpose. There is no argument a caller could pass that
 * would make the theatre server's own address the right answer, so the
 * opportunity to pass one is not offered.
 */
export function publicSiteUrl(): string {
  const configured = (
    process.env.NEXT_PUBLIC_PATIENT_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || ''
  ).trim().replace(/\/+$/, '');

  if (!configured) return PUBLIC_SITE_FALLBACK;

  try {
    const u = new URL(configured);
    if (isUnreachableFromAPhone(u.host)) return PUBLIC_SITE_FALLBACK;
    return configured;
  } catch {
    // Not a URL at all — somebody set a bare hostname, or a typo.
    return PUBLIC_SITE_FALLBACK;
  }
}

/**
 * The anonymous feedback link.
 *
 * `/f` rather than `/feedback` because it is read off a phone screen and
 * sometimes typed by hand; next.config.js rewrites it. Short enough that
 * WhatsApp does not wrap it, which is what turns a link into a non-link.
 */
export const patientFeedbackLink = (): string => `${publicSiteUrl()}/f`;
