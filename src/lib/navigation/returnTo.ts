// ============================================================
// Back, meaning back to where you actually were
// ------------------------------------------------------------
// Reported from theatre on 3 November: open the Surgical Count from the
// Theatre Reception board, press "← Back to Surgery", and you land on the
// Surgery Details page — a page you were never on. The board you came from,
// with the theatre you had picked and the case you had open, is gone.
//
// THE CAUSE IS THAT "BACK" WAS A GUESS. Every sub-page hard-coded one parent:
// the count page always went to /dashboard/surgeries/<id>. But a surgery's
// sub-pages are reached from at least eight different places — Theatre
// Reception, the surgery list, the surgery page, Completed Surgeries, the
// holding area, the BOM report, the consumables page, emergency booking. A
// single hard-coded parent is right for one of them and wrong for the rest.
//
// SO THE CALLER SAYS WHERE IT CAME FROM. A link into a sub-page carries
// ?from=<path>, and the sub-page's back link goes there. The hard-coded
// parent survives as the fallback, so a bookmark, a notification link or a
// page we have not got to yet still has somewhere sensible to go.
//
// WHY NOT router.back(). It is the obvious answer and it is wrong often
// enough to matter here: a staff member who opened the page from a WhatsApp
// link or a dashboard notification has no in-app history, and back takes them
// out of the application entirely. ?from= is explicit, survives a full page
// reload (the duty links on the reception board are plain <a> tags), and can
// be read and tested without a browser.
//
// THE PARAMETER IS NOT TRUSTED. It arrives in a URL, so it is an open-redirect
// if taken at face value: ?from=https://evil.example would send a signed-in
// nurse off-site on a link that looks like ours. Only a plain internal path is
// ever accepted, and anything else falls back silently.
// ============================================================

import { MODULES } from '@/lib/modules';

/**
 * The query parameter that carries the page you came from.
 *
 * `returnTo` and not a new name: the safety-check findings already send staff
 * into a form and back with this parameter (see lib/scribeResolutions), and
 * two conventions for the same idea is how one of them stops being
 * maintained. That file's validator now defers to this one.
 */
export const RETURN_PARAM = 'returnTo';

/** Longest path we will carry. Anything longer is not a real route. */
const MAX_RETURN_LENGTH = 512;

/**
 * Is this a path we are willing to send somebody to?
 *
 * Only an absolute path inside this application. Rejected: anything with a
 * scheme, a protocol-relative "//host" (which browsers treat as absolute), a
 * backslash (which some browsers normalise to "/" — "/\evil.example" is a
 * real bypass), and control characters.
 */
export function isSafeReturnPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const p = path.trim();
  if (!p || p.length > MAX_RETURN_LENGTH) return false;
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;
  if (p.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return false;
  return true;
}

/**
 * Add "where I came from" to a link.
 *
 * Returns the href untouched when there is nothing worth carrying, so callers
 * can pass this through unconditionally.
 */
export function withReturnTo(href: string, from: string | null | undefined): string {
  if (!isSafeReturnPath(from)) return href;
  // Already carrying one — the first hop wins, so a three-page chain still
  // returns to the board the person started on rather than walking back
  // through every screen in between.
  const [path, hash] = splitHash(href);
  if (new URLSearchParams(path.split('?')[1] || '').has(RETURN_PARAM)) return href;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${RETURN_PARAM}=${encodeURIComponent(from as string)}${hash}`;
}

function splitHash(href: string): [string, string] {
  const i = href.indexOf('#');
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}

/** What a page's own URL looks like for the purpose of coming back to it. */
export function currentReturnPath(loc: { pathname: string; search: string }): string {
  return `${loc.pathname}${loc.search || ''}`;
}

/**
 * Where "back" should go: what the caller said, or the page's own fallback.
 *
 * `search` takes whatever the caller has — a URLSearchParams, a query string,
 * or nothing at all during a server render.
 */
export function readReturnTo(
  search: URLSearchParams | string | null | undefined,
  fallback: string,
): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search || null;
  const raw = params?.get(RETURN_PARAM) ?? null;
  return isSafeReturnPath(raw) ? (raw as string) : fallback;
}

// ---- Naming the place ---------------------------------------------------
//
// "← Back" with no destination is half an answer, and a label that names the
// wrong page is worse than none: that is the bug being fixed. These patterns
// cover the routes that carry an id, which the module catalogue cannot name
// because it only knows path prefixes.
const PATTERNS: Array<{ re: RegExp; name: string }> = [
  { re: /^\/dashboard\/surgeries\/completed(\/|$)/, name: 'Completed Surgeries' },
  { re: /^\/dashboard\/surgeries\/new(\/|$)/, name: 'the booking form' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/consumables(\/|$)/, name: 'Consumables' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/scribe(\/|$)/, name: 'the safety check' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/count(\/|$)/, name: 'the Surgical Count' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/timing(\/|$)/, name: 'Surgical Timing' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/anesthesia(\/|$)/, name: 'the Anaesthesia Record' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/post-op-notes(\/|$)/, name: 'the Operation Note' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/post-op-prescription(\/|$)/, name: 'the Post-op Prescription' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/journey(\/|$)/, name: 'the Patient Journey' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/bom(\/|$)/, name: 'the Bill of Materials' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/consent(\/|$)/, name: 'the Consent Form' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/preop-data(\/|$)/, name: 'the Pre-op Results' },
  { re: /^\/dashboard\/surgeries\/[^/]+\/edit(\/|$)/, name: 'the Case Details' },
  { re: /^\/dashboard\/surgeries\/[^/]+(\/|$)/, name: 'Surgery Details' },
  { re: /^\/dashboard\/holding-area\/ward-entries(\/|$)/, name: 'the Ward Escort Log' },
  { re: /^\/dashboard\/holding-area\/[^/]+(\/|$)/, name: 'the Holding Area record' },
  { re: /^\/dashboard\/pacu\/[^/]+(\/|$)/, name: 'the Recovery record' },
  { re: /^\/dashboard\/preop-reviews\/watch(\/|$)/, name: 'the Review Watch' },
  { re: /^\/dashboard\/preop-reviews\/new(\/|$)/, name: 'the review form' },
  { re: /^\/dashboard\/reports(\/|$)/, name: 'Reports' },
  { re: /^\/dashboard\/?$/, name: 'Dashboard' },
];

/**
 * A human name for a path, for the back link to say out loud.
 *
 * Falls back to the module catalogue, which already names every top-level
 * screen for the sidebar and the access editor — one list to keep current
 * rather than two.
 */
export function labelForPath(path: string): string {
  const clean = (path || '').split('?')[0].split('#')[0];
  for (const p of PATTERNS) if (p.re.test(clean)) return p.name;

  let best: { len: number; label: string } | null = null;
  for (const m of MODULES) {
    for (const prefix of m.paths) {
      if (clean === prefix || clean.startsWith(`${prefix}/`)) {
        if (!best || prefix.length > best.len) best = { len: prefix.length, label: m.label };
      }
    }
  }
  return best ? best.label : 'Dashboard';
}
