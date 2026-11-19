import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creationTime, earliestWins } from '../../src/lib/sync/earliestWins';
import { STALE_AFTER_HOURS, alertNumber, syncAlert } from '../../src/lib/sync/syncAlert';

// 19 November: a theatre list did not reach the cloud. One staff account had
// been written before capture was enabled on users, so it had no journal entry
// and never would; the surgery naming them as assistant surgeon failed its
// foreign key on every attempt. Behind that, an August duplicate booking at
// 12,488 attempts sat at the head of an oldest-first queue, and the push
// committed all-or-nothing so nothing ever got through.

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('earliest wins — the first record stands', () => {
  const early = { createdAt: '2026-08-25T00:11:11.347Z' };
  const late = { createdAt: '2026-08-26T12:57:27.149Z' };

  it('keeps the record that already exists when it is the earlier one', () => {
    const v = earliestWins(late, early);
    expect(v.decided).toBe(true);
    if (v.decided) expect(v.winner).toBe('existing');
  });

  it('prefers the incoming record when it is the earlier one', () => {
    const v = earliestWins(early, late);
    expect(v.decided).toBe(true);
    if (v.decided) expect(v.winner).toBe('incoming');
  });

  it('settles the actual August booking the way the rule says', () => {
    // Cloud 00:11:11.347, server 00:11:12.813 — 1.5 seconds apart. The cloud
    // record is the earlier one and stands.
    const v = earliestWins(
      { requestedAt: '2026-08-25T00:11:12.813Z' },
      { requestedAt: '2026-08-25T00:11:11.347Z' },
    );
    expect(v.decided).toBe(true);
    if (v.decided) {
      expect(v.winner).toBe('existing');
      expect(v.reason).toMatch(/1\.5 seconds apart/);
    }
  });

  it('gives a tie to the row already in place', () => {
    const same = { createdAt: '2026-08-25T00:11:11.347Z' };
    const v = earliestWins({ ...same }, { ...same });
    if (v.decided) expect(v.winner).toBe('existing');
  });

  it('refuses to decide when neither record carries a creation time', () => {
    // A rule that guessed here would be worse than one that stops.
    const v = earliestWins({ name: 'x' }, { name: 'y' });
    expect(v.decided).toBe(false);
    if (!v.decided) expect(v.reason).toMatch(/person must decide/i);
  });

  it('never uses updatedAt or a sync clock to judge which came first', () => {
    // Both move when anybody touches the row. The August duplicate was WRITTEN
    // a day and a half later and would have looked like the original.
    expect(creationTime({ updatedAt: '2020-01-01T00:00:00Z' })).toBeNull();
    expect(creationTime({ sync_hlc: '001795070187436:000000:local-unth' })).toBeNull();
  });

  it('reads the creation fields this schema actually uses', () => {
    expect(creationTime({ createdAt: '2026-01-01T00:00:00Z' })?.field).toBe('createdAt');
    expect(creationTime({ requestedAt: '2026-01-01T00:00:00Z' })?.field).toBe('requestedAt');
    expect(creationTime(null)).toBeNull();
  });

  it('is wired into the conflict path, and keeps what it displaces', () => {
    const apply = read('src/lib/sync/applyEntry.ts');
    expect(apply).toContain('earliestWins');
    // An automatic rule is only acceptable while it stays readable and
    // reversible. The displaced row is written to sync_conflicts in the same
    // transaction, before it is removed.
    const displace = apply.slice(apply.indexOf('if (rivalId) {'));
    expect(displace.slice(0, 1400)).toContain('sync_conflicts');
    expect(displace.indexOf('sync_conflicts')).toBeLessThan(displace.indexOf('delete from'));
  });
});

describe('the alert when changes stop reaching the cloud', () => {
  const now = new Date('2026-11-19T07:00:00Z');

  it('says nothing when the queue is empty', () => {
    expect(syncAlert({ unsent: 0 }, {}, now).raise).toBe(false);
  });

  it('says nothing about a backlog that is still moving', () => {
    const a = syncAlert(
      { unsent: 40, oldestUnsent: '2026-11-19T06:50:00Z', lastPushOkAt: '2026-11-19T06:59:00Z' },
      {}, now);
    expect(a.raise).toBe(false);
    expect(a.detail).toMatch(/moving/i);
  });

  it('raises the alarm when the oldest entry has stopped moving', () => {
    const a = syncAlert(
      { unsent: 104, oldestUnsent: '2026-09-08T06:42:00Z', lastPushOkAt: '2026-11-19T06:59:00Z' },
      { SYNC_ALERT_WHATSAPP: '08033328385' }, now);
    expect(a.raise).toBe(true);
    expect(a.action).toContain('screenshot');
    expect(a.action).toContain('08033328385');
  });

  it('raises it when pushes themselves have stopped', () => {
    const a = syncAlert(
      { unsent: 3, oldestUnsent: '2026-11-19T06:55:00Z', lastPushOkAt: '2026-11-19T03:00:00Z' },
      {}, now);
    expect(a.raise).toBe(true);
  });

  it('still tells somebody what to do when no number is configured', () => {
    const a = syncAlert(
      { unsent: 9, oldestUnsent: '2026-09-08T06:42:00Z' }, {}, now);
    expect(a.raise).toBe(true);
    expect(a.action).toMatch(/screenshot/i);
    expect(a.action).toMatch(/SYNC_ALERT_WHATSAPP/);
  });

  it('says the server is still safe to work from', () => {
    // The theatre can carry on; it is the cloud copy that is behind. A message
    // that reads as "the system is down" empties a theatre for no reason.
    const a = syncAlert({ unsent: 50, oldestUnsent: '2026-09-08T06:42:00Z' }, {}, now);
    expect(a.detail).toMatch(/safe|carry on/i);
  });

  it('keeps the alert number out of the repository', () => {
    // A personal number committed here is in every clone, fork and backup for
    // as long as the repository exists. Same rule as Ayogu's number.
    const src = read('src/lib/sync/syncAlert.ts');
    expect(src).not.toMatch(/\b0803332\d{4}\b/);
    expect(alertNumber({})).toBeNull();
    expect(alertNumber({ SYNC_ALERT_WHATSAPP: '080' })).toBe('080');
  });

  it('waits before crying, so nobody learns to ignore it', () => {
    expect(STALE_AFTER_HOURS).toBeGreaterThanOrEqual(1);
  });
});

describe('a batch that cannot finish still commits what applied', () => {
  it('stops the apply loop before the transaction budget, rather than after', () => {
    // The loop used to run until the 110s budget killed the transaction, and
    // then EVERYTHING rolled back — including entries that had applied. The
    // sender, getting no results, re-sent the identical batch for hours.
    const push = read('src/app/api/sync/push/route.ts');
    expect(push).toContain('APPLY_BUDGET_MS');
    const budget = /const APPLY_BUDGET_MS = ([0-9_]+)/.exec(push);
    expect(budget).not.toBeNull();
    expect(Number(budget![1].replace(/_/g, ''))).toBeLessThan(110_000);
    expect(push).toContain('stoppedEarly');
  });

  it('leaves the unreached entries queued rather than acknowledging them', () => {
    const push = read('src/app/api/sync/push/route.ts');
    const loop = push.slice(push.indexOf('const startedAt = Date.now()'));
    expect(loop.slice(0, 600)).toContain('break');
  });
});

describe('rows that exist on one node only are found before they cost a list', () => {
  it('the deploy checks the tables that stop a case appearing', () => {
    const deploy = read('scripts/local-server/deploy.sh');
    expect(deploy).toContain('backfill-journal.js --priority');
  });

  it('the priority scan covers users, patients and surgeries', () => {
    // The 19 November failure was a users row; the surgery referencing it
    // could never insert.
    const backfill = read('scripts/local-server/backfill-journal.js');
    const list = backfill.slice(backfill.indexOf('const PRIORITY_TABLES'));
    for (const t of ['users', 'patients', 'surgeries']) {
      expect(list.slice(0, 400), t).toContain(`'${t}'`);
    }
  });

  it('only ever journals rows the peer does not have', () => {
    const backfill = read('scripts/local-server/backfill-journal.js');
    expect(backfill).toContain('stranded');
    expect(backfill).toMatch(/not stranded|already holds/i);
  });
});
