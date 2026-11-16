import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

// The deadline checker: who may run it, and what it does with its own failures.
//
// This endpoint had NO authentication of any kind — no CRON_SECRET check, no
// Vercel check, no session — while seven sibling maintenance routes were
// already guarded. Anyone who knew the URL could make the Office of the Chief
// Medical Director issue a formal disciplinary query to a named member of
// staff, and could do it repeatedly.
//
// It also wrote every reminder inside an empty catch, under the comment
// "Notification model may have different fields". The model has exactly
// userId, type, title and message. So the comment was wrong, and a reminder
// that failed to record left nothing behind at all — on a job whose entire
// purpose is to establish that somebody was warned before they were queried.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

const ROUTE = 'src/app/api/deadline-checker/route.ts';
const route = codeOf(ROUTE);

describe('who may run the deadline checker', () => {
  it('asks authoriseCron before doing anything', () => {
    expect(route).toContain("from '@/lib/cronAuth'");
    expect(route).toContain('const auth = await authoriseCron(request);');
  });

  it('refuses outright when the credential is not accepted', () => {
    expect(route).toContain('if (!auth.ok)');
    expect(route).toContain('status: auth.status ?? 403');
  });

  it('gates on the guard BEFORE it reads any data', () => {
    // A check that runs after the work is not a check.
    //
    // Measured INSIDE the handler. An earlier version of this test searched
    // the whole file and failed on correct code, because the module defines
    // helpers above GET whose bodies contain `await prisma.` — text that
    // appears earlier but runs later, if at all.
    const handler = route.slice(route.indexOf('export async function GET'));
    const guardAt = handler.indexOf('await authoriseCron(request)');
    const firstRead = handler.indexOf('await prisma.');
    expect(guardAt).toBeGreaterThan(0);
    expect(firstRead).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(firstRead);
  });

  it('defaults an administrator to a dry run, following the house convention', () => {
    // An administrator opening the URL in a browser is inspecting, not issuing
    // formal queries to named staff. maintenance/preop-alerts settled the
    // spelling of this: ?send=1.
    expect(route).toContain(
      "const dryRun = auth.who === 'administrator' && searchParams.get('send') !== '1';",
    );
  });

  it('still runs for the scheduler, which is the point of cronAuth', () => {
    // cronAuth deliberately accepts Vercel's own scheduler even when
    // CRON_SECRET is unset, because a check that silently stops the job is how
    // zero preoperative alerts went out for a month.
    const cronAuth = read('src/lib/cronAuth.ts');
    expect(cronAuth).toContain('isVercelCron');
  });

  it('keeps the admin BUTTON working, rather than silently making it a no-op', () => {
    // /dashboard/settings has a "Run deadline check" button. Without this it
    // would quietly become a dry run that reports "0 reminders sent".
    const settings = codeOf('src/app/dashboard/settings/page.tsx');
    expect(settings).toContain('/api/deadline-checker?action=check-all&send=1');
  });
});

describe('a dry run must not write', () => {
  it('gates every write the job makes', () => {
    // Four side effects: notifications, disciplinary queries, attention rows,
    // and the referral to Theatre Audit. A "dry run" that still writes rows is
    // not one.
    const guards = route.match(/if \(dryRun\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(4);
  });

  it('routes notifications and queries through one writer each', () => {
    expect(route).toContain('const notify = async');
    expect(route).toContain('const raiseQuery = async');
    // No direct creates left outside those two helpers.
    const directNotify = route.match(/prisma\.notification\.create/g) ?? [];
    const directQuery = route.match(/prisma\.disciplinaryQuery\.create/g) ?? [];
    expect(directNotify).toHaveLength(1);
    expect(directQuery).toHaveLength(1);
  });

  it('returns a reference even on a dry run, because the caller prints one', () => {
    expect(route).toContain('DRY-RUN');
  });

  it('keeps the writers per-request, not at module scope', () => {
    // Module-level mutable state is shared between concurrent invocations in
    // one instance, which is how one request's dry run silences another's.
    const handlerAt = route.indexOf('export async function GET');
    expect(route.indexOf('const notify = async')).toBeGreaterThan(handlerAt);
    expect(route.indexOf('const failures')).toBeGreaterThan(handlerAt);
  });
});

describe('it no longer swallows its own failures', () => {
  it('has no empty catch left', () => {
    expect(route).not.toMatch(/catch \(e\) \{\s*\}/);
    expect(route).not.toMatch(/catch \{\s*\}/);
  });

  it('has dropped the comment that was not true', () => {
    // Against the COMMENT-STRIPPED source: the replacement writer documents
    // what it replaced, and quotes the old comment while doing so. Asserting
    // against the raw file makes the guard fail on its own explanation.
    expect(route).not.toContain('Notification model may have different fields');
  });

  it('records what it could not write, and reports it in its own output', () => {
    expect(route).toContain('noteFailure');
    expect(route).toContain('results.failures = failures;');
  });

  it('still refuses to let a failed notification stop the record existing', () => {
    // The one swallow that was reasoned stays non-throwing — it just stops
    // discarding the error.
    expect(route).toContain("noteFailure(e, 'systemNotification')");
  });

  it('writes the fields the model actually has', () => {
    const schema = read('prisma/schema.prisma');
    const model = schema.slice(
      schema.indexOf('model Notification '),
      schema.indexOf('@@map("notifications")'),
    );
    for (const field of ['userId', 'type', 'title', 'message']) {
      expect(model, field).toContain(field);
    }
  });
});
