// ============================================================
// Turning a refusal into something the person can act on
// ------------------------------------------------------------
// Across this application a form that will not submit says one sentence in red
// and stops. "Validation failed". "Forbidden". "Internal server error". The
// person at the keyboard — often with a patient in front of them — is left to
// work out which field, whose permission, and whether to try again.
//
// The scheduling dialog showed what the alternative looks like: name what is in
// the way, and offer the things that would clear it. This does the same for
// every other refusal in the application, and it does it WITHOUT rewriting a
// hundred API routes, by reading the responses they already return.
//
// WHY A TRANSLATION LAYER RATHER THAN A NEW CONVENTION. There are three
// different shapes for a validation error in this codebase alone — an array of
// Zod issues under `details`, a flattened object under `details`, and the array
// under `error` itself. A new convention would mean editing every route and
// would still not cover the ones nobody remembered. Reading what is actually
// sent covers all of them today.
//
// WHAT IT WILL NOT DO. It never invents a reason. Where a response carries
// nothing a person could act on, this returns null and the form's own error
// message stands — a dialog that says "something went wrong" on top of a
// message that already said so is noise with an extra click in it.
// ============================================================

export type FixKind =
  /** Take them to the screen where the thing can be done. */
  | 'go'
  /** Put the cursor in the field that is wrong. */
  | 'field'
  /** Send the same request again. Only offered where retrying can work. */
  | 'retry'
  /** Nothing to do here but close and carry on. */
  | 'close';

export interface Fix {
  kind: FixKind;
  /** In the imperative: what pressing this does. */
  label: string;
  /** The consequence or the caveat, where one is worth stating. */
  detail?: string;
  /** For 'go'. */
  href?: string;
  /** For 'field' — the input's name attribute. */
  field?: string;
}

export interface FieldProblem {
  /** The input's name attribute, where it can be worked out. */
  name?: string;
  /** How a person would say it: "Scheduled time". */
  label: string;
  /** What is wrong with it, in the server's words. */
  message: string;
}

export interface Blocker {
  code: string;
  /** Four or five words. The heading of the dialog. */
  title: string;
  /** One sentence saying why, without blame and without jargon. */
  why: string;
  fields: FieldProblem[];
  fixes: Fix[];
  /** 'block' cannot be worked around here; 'warn' can. */
  severity: 'block' | 'warn';
}

export interface Refusal {
  status: number;
  url: string;
  method: string;
  /** The parsed response body, whatever shape it came in. */
  body: unknown;
  /** True when the device is offline, which changes the advice entirely. */
  offline?: boolean;
}

/**
 * Codes whose own screens already do this better.
 *
 * A duplicate patient, an already-booked case and a theatre clash each have a
 * bespoke panel that shows the actual records and offers the real choices. A
 * generic dialog on top of those would be a worse answer arriving first.
 */
export const HANDLED_ELSEWHERE = new Set([
  'DUPLICATE',
  'NEAR_DUPLICATE',
  'ALREADY_BOOKED',
  'OVERLAP',
  'PAST_CUTOFF',
  'NOT_MOVABLE',
  'PLAN_INVALID',
]);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * A field name as a person would say it.
 *
 * `scheduledTime` becomes "Scheduled time", `patient.folderNumber` becomes
 * "Folder number". The last segment is used because a path prefix is about the
 * shape of the request, which is not the user's concern.
 */
export function humaniseField(path: unknown): string {
  const raw = Array.isArray(path) ? path[path.length - 1] : path;
  const name = str(raw) || String(raw ?? '');
  if (!name) return 'This field';
  // Sentence case, not title case. "Scheduled time" is how a person says it;
  // "Scheduled Time" is how a database column looks with a space in it, and a
  // dialog full of those reads like the schema rather than like help.
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Field problems out of whichever validation shape arrived.
 *
 * Three are in use in this codebase and all three are handled, because the
 * alternative is a dialog that works on some screens and not others — which
 * teaches people not to trust it.
 */
export function readFieldProblems(body: unknown): FieldProblem[] {
  const b = obj(body);
  const out: FieldProblem[] = [];

  const fromIssueArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const issue of arr) {
      const i = obj(issue);
      const path = i.path ?? i.field;
      const message = str(i.message) || 'Needs a value.';
      const name = Array.isArray(path) ? path.join('.') : str(path) || undefined;
      out.push({ name, label: humaniseField(path), message });
    }
  };

  // { details: [ {path, message} ] }  and  { error: [ {path, message} ] }
  fromIssueArray(b.details);
  fromIssueArray(b.error);

  // { details: { fieldErrors: { name: [msg] }, formErrors: [msg] } }
  const details = obj(b.details);
  const fieldErrors = obj(details.fieldErrors);
  for (const [name, messages] of Object.entries(fieldErrors)) {
    const first = Array.isArray(messages) ? str(messages[0]) : str(messages);
    out.push({ name, label: humaniseField(name), message: first || 'Needs a value.' });
  }
  if (Array.isArray(details.formErrors)) {
    for (const m of details.formErrors) {
      if (str(m)) out.push({ label: 'This form', message: str(m) });
    }
  }

  // The post-operative note returns its own, already in plain words.
  if (Array.isArray(b.problems)) {
    for (const p of b.problems) {
      const q = obj(p);
      if (str(q.message)) {
        out.push({ name: str(q.field) || undefined, label: humaniseField(q.field), message: str(q.message) });
      }
    }
  }

  return out;
}

/**
 * Bare HTTP words, which explain nothing to the person reading them.
 *
 * "Forbidden" is the status line, not a reason. Passed through it produces a
 * dialog that has gone to the trouble of appearing in order to say the same
 * unhelpful word the form was already showing — so these are treated as no
 * message at all, and the wording written for each case is used instead.
 */
const EMPTY_WORDS = new Set([
  'validation', 'validation failed', 'forbidden', 'unauthorized', 'unauthorised',
  'not found', 'bad request', 'internal server error', 'error', 'failed',
  'conflict', 'server error', 'something went wrong',
]);

/** The server's own sentence, if it sent one worth showing. */
function serverMessage(body: unknown): string {
  const b = obj(body);
  const candidates = [b.error, b.message];
  for (const c of candidates) {
    const text = typeof c === 'string' ? c.trim() : '';
    if (!text) continue;
    if (EMPTY_WORDS.has(text.toLowerCase().replace(/[.!]$/, ''))) continue;
    return text;
  }
  return '';
}

/** Which module a URL belongs to, for wording and for where to send people. */
function moduleOf(url: string): string {
  const m = /\/api\/([^/?]+)/.exec(url);
  return m ? m[1] : '';
}

/**
 * What is in the way, and what would clear it.
 *
 * Returns null when there is nothing useful to add — an unrecognised refusal
 * with no message is better left to the form, which at least knows what the
 * person was doing.
 */
export function describeBlocker(refusal: Refusal): Blocker | null {
  const { status, url, body, offline } = refusal;
  const b = obj(body);
  const code = str(b.code);
  const message = serverMessage(body);
  const fields = readFieldProblems(body);

  if (code && HANDLED_ELSEWHERE.has(code)) return null;

  // ---- The device is not on the network ----------------------------------
  if (offline || status === 0) {
    return {
      code: 'OFFLINE',
      title: 'Saved, but not sent yet',
      why: 'This device is not on the network, so your work has been kept here and will be sent as soon as it is back.',
      fields: [],
      severity: 'warn',
      fixes: [
        { kind: 'close', label: 'Carry on', detail: 'It syncs by itself — you do not need to do this again.' },
        { kind: 'go', label: 'Check the theatre Wi-Fi', href: '/hotspot/login', detail: 'If you have been signed out of the network, sign in again.' },
      ],
    };
  }

  // ---- Signed out --------------------------------------------------------
  if (status === 401) {
    return {
      code: 'SIGNED_OUT',
      title: 'You have been signed out',
      why: 'Your session has ended, so the server did not accept the change. Nothing was saved.',
      fields: [],
      severity: 'block',
      fixes: [
        { kind: 'go', label: 'Sign in again', href: '/auth/login', detail: 'Come back to this screen afterwards and re-enter it.' },
      ],
    };
  }

  // ---- Not allowed -------------------------------------------------------
  if (status === 403) {
    return {
      code: 'NO_ACCESS',
      title: 'Your role cannot do this',
      why: message || 'This action belongs to a different role, so the server refused it.',
      fields: [],
      severity: 'block',
      fixes: [
        {
          kind: 'close',
          label: 'Ask an administrator for this module',
          detail: 'An administrator can grant it in User Management in under a minute. Tell them which screen you were on.',
        },
        { kind: 'go', label: 'Back to the dashboard', href: '/dashboard' },
      ],
    };
  }

  // ---- Too big -----------------------------------------------------------
  if (status === 413) {
    return {
      code: 'TOO_LARGE',
      title: 'That file is too large',
      why: message || 'The file attached is bigger than the server will accept.',
      fields: [],
      severity: 'block',
      fixes: [
        {
          kind: 'close',
          label: 'Attach a smaller file',
          detail: 'A photograph taken on a phone is usually well under the limit; a scan at full resolution is usually over it.',
        },
      ],
    };
  }

  // ---- Something is missing or wrong on the form -------------------------
  if (fields.length) {
    const first = fields[0];
    const many = fields.length > 1;
    return {
      code: 'INCOMPLETE',
      title: many ? `${fields.length} things need attention` : 'One thing needs attention',
      why: many
        ? 'The form cannot be submitted until these are put right. Each one is listed below.'
        : `${first.label}: ${first.message}`,
      fields,
      severity: 'block',
      fixes: [
        ...(first.name
          ? [{
            kind: 'field' as FixKind,
            label: `Go to ${first.label.toLowerCase()}`,
            field: first.name,
            detail: first.message,
          }]
          : []),
        { kind: 'close', label: 'Back to the form' },
      ],
    };
  }

  // ---- A prerequisite that lives on another screen ------------------------
  const prerequisite = prerequisiteFix(status, code, message, url);
  if (prerequisite) return prerequisite;

  // ---- The server itself had a problem -----------------------------------
  if (status >= 500) {
    return {
      code: 'SERVER_ERROR',
      title: 'The server could not complete this',
      // Our sentence leads and the server's detail follows, rather than
      // replacing it. The person needs to know their work was not saved; the
      // technical fragment is for whoever they telephone about it, and on its
      // own it is often three words that mean nothing to either of them.
      why: 'Something failed on the server, and your entry was not saved.'
        + (message ? ` The server said: ${message}` : ''),
      fields: [],
      severity: 'warn',
      fixes: [
        { kind: 'retry', label: 'Try again', detail: 'Most of these are momentary. Nothing was saved, so pressing again is safe.' },
        { kind: 'close', label: 'Leave it for now' },
      ],
    };
  }

  // ---- Anything else that at least said something ------------------------
  if (message) {
    return {
      code: code || 'REFUSED',
      title: 'This cannot be saved yet',
      why: message,
      fields: [],
      severity: 'block',
      fixes: [{ kind: 'close', label: 'Back to the form' }],
    };
  }

  return null;
}

/**
 * Refusals that mean "go and do this other thing first".
 *
 * These are the ones worth knowing by name, because the fix is on a different
 * screen and the person is unlikely to guess which.
 */
function prerequisiteFix(
  status: number, code: string, message: string, url: string,
): Blocker | null {
  const area = moduleOf(url);

  const blocker = (b: Omit<Blocker, 'fields' | 'severity'> & Partial<Pick<Blocker, 'severity'>>): Blocker =>
    ({ fields: [], severity: 'block', ...b });

  if (status === 404 && /patient/i.test(message)) {
    return blocker({
      code: 'NO_PATIENT',
      title: 'That patient is not on file',
      why: 'The patient chosen does not exist on the server — usually because the registration has not finished syncing, or the record was opened from a stale list.',
      fixes: [
        { kind: 'go', label: 'Register the patient', href: '/dashboard/patients/new', detail: 'Search first: they may already be on file under a folder number typed differently.' },
        { kind: 'go', label: 'Open the patient list', href: '/dashboard/patients' },
        { kind: 'retry', label: 'Try again', detail: 'If the registration was made moments ago it may have arrived by now.' },
      ],
    });
  }

  if (code === 'CONSENT_REQUIRED') {
    return blocker({
      code,
      title: 'Consent is outstanding',
      why: message || 'This case cannot go forward until consent is recorded.',
      fixes: [
        { kind: 'go', label: 'Open the case and record consent', href: '/dashboard/surgeries', detail: 'Complete the consent form, or upload the signed paper.' },
      ],
    });
  }

  if (code === 'NOT_FIT_FOR_ANAESTHESIA') {
    return blocker({
      code,
      title: 'The patient is not marked fit',
      why: message || 'An anaesthetist has not recorded a fitness decision, or has recorded that the patient is not yet fit.',
      fixes: [
        { kind: 'go', label: 'Open the review board', href: '/dashboard/anaesthetist-board', detail: 'The review, and any optimisation the patient needs, are recorded there.' },
        { kind: 'go', label: 'Pre-operative reviews', href: '/dashboard/preop-reviews' },
      ],
    });
  }

  if (code === 'INSUFFICIENT_STOCK' || code === 'NO_STOCK') {
    return blocker({
      code,
      title: 'There is not enough stock',
      why: message || 'The quantity asked for is more than the store holds.',
      fixes: [
        { kind: 'go', label: 'Check what is on the shelf', href: '/dashboard/theatre-supply', detail: 'Stock is allocated first-expired-first-out; an expired batch is never offered.' },
        { kind: 'close', label: 'Reduce the quantity and try again' },
      ],
    });
  }

  if (status === 409 && area === 'surgeries') {
    return blocker({
      code: code || 'CASE_CONFLICT',
      title: 'This case will not accept the change',
      why: message || 'The case is in a state that does not allow this.',
      fixes: [
        { kind: 'go', label: 'Open the surgery list', href: '/dashboard/surgeries' },
        { kind: 'close', label: 'Back to the form' },
      ],
    });
  }

  return null;
}
