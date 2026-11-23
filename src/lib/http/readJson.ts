/**
 * Reading a JSON answer without turning every server fault into a lie.
 *
 * `await res.json()` on a response that is not JSON throws
 *
 *     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * and that string is what the user is shown. It names JSON, so it reads as a
 * data problem; it names a '<', so it reads as something malformed. Neither is
 * true. What actually happened is that the request never reached the handler —
 * the function timed out, ran out of memory, was refused, or the route was not
 * there — and the platform answered with its own HTML error page. The one
 * number that would have told anybody which of those it was, the status code,
 * is the one thing the message leaves out.
 *
 * That cost a real afternoon on the research dashboard: the page reported a
 * JSON fault for a query that was simply too large, and the message sent the
 * reader looking at the parser.
 *
 * So: look at the status and the content type BEFORE parsing, and say what
 * happened in words that point at the cause.
 *
 * Pure apart from reading the body, so the wording can be argued with in a
 * test rather than discovered in a screenshot.
 */

/** The start of a body that is a web page rather than data. */
export function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml');
}

export interface FailureFacts {
  status: number;
  contentType?: string | null;
  /** The first part of the body, when there is one. */
  body?: string;
  /** What the caller was doing, e.g. "load the analytics". */
  doing?: string;
}

/**
 * What to tell somebody when the answer was not the JSON we asked for.
 *
 * The status is always in it. An operator reading a screenshot can do nothing
 * with "failed"; 504 and 403 send them to completely different places, and the
 * difference costs one number.
 */
export function httpFailureMessage(facts: FailureFacts): string {
  const doing = facts.doing ? ` while trying to ${facts.doing}` : '';
  const s = facts.status;

  if (s === 401) {
    return 'Your session has expired (401). Sign in again and reopen this page.';
  }
  if (s === 403) {
    return `You do not have access to this${doing} (403). `
      + 'If you believe you should, ask the Theatre Research Board for a grant.';
  }
  if (s === 404) {
    return `That report does not exist on this server (404)${doing}. `
      + 'The server may be running an older version than this page.';
  }
  if (s === 504 || s === 408) {
    // The one worth being specific about: it is not broken, it is too big.
    return `The server took too long${doing} (${s}). `
      + 'This usually means the report covers too many cases — set a From and To '
      + 'date, or narrow it by unit or specialty, and apply again.';
  }
  if (s === 413) {
    return `The answer was too large to return${doing} (413). Narrow the dates and try again.`;
  }
  if (s >= 500) {
    return `The server could not finish${doing} (${s}). `
      + 'If it keeps happening with a narrow date range, it is a fault worth reporting.';
  }
  if (facts.body && looksLikeHtml(facts.body)) {
    return `The server answered with a web page instead of data (${s})${doing}. `
      + 'That usually means the request did not reach the report at all.';
  }
  return `The server answered ${s}${doing}.`;
}

/**
 * Read a JSON body, or throw an Error whose message is worth showing.
 *
 * The body is read as text first and parsed here, because reading it twice is
 * not allowed and the text is what makes a useful message possible.
 */
export async function readJson<T = unknown>(
  res: Response,
  doing?: string,
): Promise<T> {
  const text = await res.text();

  if (!res.ok) {
    // A handler that failed properly still answers in JSON and says why. Its
    // own words beat anything composed here.
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) throw new Error(parsed.error);
    } catch (e) {
      if (e instanceof Error && e.message && !/JSON/i.test(e.message)) throw e;
    }
    throw new Error(httpFailureMessage({
      status: res.status,
      contentType: res.headers.get('content-type'),
      body: text,
      doing,
    }));
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // 200, and still not JSON. A proxy or a sign-in page stood in for the
    // route, which is worth saying plainly rather than blaming the parser.
    throw new Error(httpFailureMessage({
      status: res.status,
      contentType: res.headers.get('content-type'),
      body: text,
      doing,
    }));
  }
}
