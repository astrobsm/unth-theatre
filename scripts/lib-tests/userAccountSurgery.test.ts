import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import {
  classifyColumn,
  looksLikeUserColumn,
  refuseMerge,
  blanksFilledFrom,
  describeMergeCounts,
  blockingTables,
  blockedMessage,
  CREDENTIAL_TABLES,
  NOT_CREDENTIALS,
  type MergeCount,
} from '../../src/lib/users/merge';
import {
  MAX_PASSWORD_ATTEMPTS,
  WINDOW_MS,
  tooManyAttempts,
  recordAttempt,
  waitSeconds,
  stepUpPrompt,
  lockedOutMessage,
  wrongPasswordMessage,
} from '../../src/lib/users/stepUp';

/**
 * Merging duplicate accounts, and the password in front of it.
 *
 * Two kinds of mistake are worth a test rather than a careful reading. A merge
 * that moves a credential turns a tidy-up into a privilege transfer; and a
 * merge that misses a table leaves rows pointing at an account that no longer
 * exists. The first is what classifyColumn is for, and the schema guard below
 * is what stops a new credential table arriving unclassified.
 */

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

const count = (over: Partial<MergeCount> = {}): MergeCount => ({
  table: 'surgeries',
  column: 'surgeonId',
  rows: 3,
  disposition: 'move',
  why: 'why',
  ...over,
});

// ---------------------------------------------------------------------------
// What a merge may touch
// ---------------------------------------------------------------------------

describe('classifyColumn', () => {
  it('moves the work a duplicate recorded', () => {
    for (const [table, column] of [
      ['surgeries', 'surgeonId'],
      ['rosters', 'userId'],
      ['case_cancellations', 'cancelledBy'],
      ['audit_logs', 'userId'],
      ['nurse_handovers', 'handingOverNurseId'],
      ['theatre_case_flows', 'cleaningCompletedById'],
    ] as const) {
      expect(classifyColumn(table, column).disposition, `${table}.${column}`).toBe('move');
    }
  });

  it('deletes credentials rather than handing them to the kept account', () => {
    for (const table of ['auth_otps', 'device_credentials', 'device_tokens', 'push_subscriptions', 'hotspot_devices']) {
      expect(classifyColumn(table, 'userId').disposition, table).toBe('drop');
    }
  });

  it('leaves the audit log saying what happened to the old account', () => {
    // Which record an entry was ABOUT is history. Who did it moves, because
    // that is the same person either way.
    expect(classifyColumn('audit_logs', 'recordId').disposition).toBe('freeze');
    expect(classifyColumn('imprest_audit_logs', 'entityId').disposition).toBe('freeze');
    expect(classifyColumn('audit_logs', 'userId').disposition).toBe('move');
  });

  it('leaves replication bookkeeping alone', () => {
    expect(classifyColumn('sync_conflicts', 'resolvedBy').disposition).toBe('freeze');
    expect(classifyColumn('imprest_sync_mutation_log', 'userId').disposition).toBe('freeze');
  });

  it('stops rather than guess at a table it cannot place', () => {
    const plan = classifyColumn('webauthn_credentials_v2', 'userId');
    expect(plan.disposition).toBe('refuse');
    expect(plan.why).toMatch(/classify it/i);
  });

  it('does not mistake OCR tokens for credentials', () => {
    // They are words read off a scanned document. A name-shaped rule alone
    // would have deleted somebody's corrections.
    expect(NOT_CREDENTIALS.has('ocr_tokens')).toBe(true);
    expect(classifyColumn('ocr_tokens', 'correctedById').disposition).toBe('move');
  });

  it('never classifies the same table two ways', () => {
    for (const table of Array.from(CREDENTIAL_TABLES)) {
      expect(NOT_CREDENTIALS.has(table), table).toBe(false);
    }
  });
});

describe('looksLikeUserColumn', () => {
  it('casts a wide net, because an exact id match does the filtering', () => {
    expect(looksLikeUserColumn('userId')).toBe(true);
    expect(looksLikeUserColumn('requestedById')).toBe(true);
    expect(looksLikeUserColumn('cancelledBy')).toBe(true);
    // Caught too, and harmless: a patient id is never a user id.
    expect(looksLikeUserColumn('patientId')).toBe(true);
  });

  it('leaves ordinary columns out of the scan', () => {
    expect(looksLikeUserColumn('fullName')).toBe(false);
    expect(looksLikeUserColumn('status')).toBe(false);
    expect(looksLikeUserColumn('createdAt')).toBe(false);
  });
});

/**
 * THE GUARD THAT MATTERS.
 *
 * The engine finds columns by asking the database, so a new table is scanned
 * without anybody remembering to add it. What is NOT automatic is deciding
 * whether its rows are work or credentials -- and the dangerous default is
 * "move". This reads the schema and fails the moment a model arrives whose
 * name reads as a credential and which nobody has placed.
 */
describe('the classification has not fallen behind the schema', () => {
  const schema = read('prisma/schema.prisma');
  const tables = Array.from(schema.matchAll(/@@map\("([^"]+)"\)/g)).map((m) => m[1]);

  it('reads the schema at all', () => {
    expect(tables.length).toBeGreaterThan(200);
  });

  it('places every credential-shaped table on one list or the other', () => {
    const unplaced = tables.filter((t) => classifyColumn(t, 'userId').disposition === 'refuse');
    expect(unplaced).toEqual([]);
  });

  it('still holds the credential tables this schema actually has', () => {
    for (const table of ['auth_otps', 'device_credentials', 'device_tokens', 'push_subscriptions', 'hotspot_devices']) {
      expect(tables, `${table} has been renamed or removed`).toContain(table);
      expect(CREDENTIAL_TABLES.has(table), table).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Which pair may be merged
// ---------------------------------------------------------------------------

describe('refuseMerge', () => {
  it('allows an ordinary pair', () => {
    expect(refuseMerge({ keepId: 'a', loseId: 'b', adminId: 'admin' })).toBeNull();
  });

  it('refuses the same account twice', () => {
    expect(refuseMerge({ keepId: 'a', loseId: 'a', adminId: 'admin' })).toMatch(/same account/i);
  });

  it('refuses to fold away the account doing the merging', () => {
    expect(refuseMerge({ keepId: 'a', loseId: 'admin', adminId: 'admin' })).toMatch(/signed in with/i);
  });

  it('refuses an empty side', () => {
    expect(refuseMerge({ keepId: '', loseId: 'b', adminId: 'admin' })).toBeTruthy();
    expect(refuseMerge({ keepId: 'a', loseId: '', adminId: 'admin' })).toBeTruthy();
  });
});

describe('blanksFilledFrom', () => {
  it('fills only what the kept account is missing', () => {
    const fill = blanksFilledFrom(
      { email: 'rita@unth.ng', phoneNumber: null, staffCode: '  ' },
      { email: 'other@unth.ng', phoneNumber: '08030000000', staffCode: 'SCN053' },
    );
    expect(fill).toEqual({ phoneNumber: '08030000000', staffCode: 'SCN053' });
  });

  it('never overwrites what the kept account already has', () => {
    const fill = blanksFilledFrom(
      { email: 'keep@unth.ng', department: 'Nursing' },
      { email: 'lose@unth.ng', department: 'Anaesthesia' },
    );
    expect(fill).toEqual({});
  });

  it('treats whitespace as missing and trims what it takes', () => {
    expect(blanksFilledFrom({ email: '' }, { email: '  a@b.ng  ' })).toEqual({ email: 'a@b.ng' });
  });
});

// ---------------------------------------------------------------------------
// What the screen is told
// ---------------------------------------------------------------------------

describe('describeMergeCounts', () => {
  it('says plainly when a merge is just a delete', () => {
    expect(describeMergeCounts([])).toMatch(/same as deleting/i);
  });

  it('counts moved, dropped and frozen separately', () => {
    const line = describeMergeCounts([
      count({ rows: 21, table: 'audit_logs', column: 'userId' }),
      count({ rows: 3, table: 'case_cancellations', column: 'cancelledBy' }),
      count({ rows: 2, disposition: 'drop', table: 'device_tokens' }),
      count({ rows: 1, disposition: 'freeze', table: 'audit_logs', column: 'recordId' }),
    ]);
    expect(line).toContain('24 records moved');
    expect(line).toContain('2 device credentials deleted');
    expect(line).toContain('1 audit pointer left untouched');
  });

  it('does not say "1 records"', () => {
    expect(describeMergeCounts([count({ rows: 1 })])).toContain('1 record moved');
  });
});

describe('blockingTables', () => {
  it('names what stopped the merge, and says nothing moved', () => {
    const blocked = blockingTables([
      count({ rows: 4, disposition: 'refuse', table: 'webauthn_keys' }),
      count({ rows: 0, disposition: 'refuse', table: 'empty_thing' }),
      count({ rows: 9 }),
    ]);
    expect(blocked.map((b) => b.table)).toEqual(['webauthn_keys']);
    const message = blockedMessage(blocked);
    expect(message).toContain('webauthn_keys');
    expect(message).toMatch(/nothing was moved/i);
  });

  it('blocks on a column it could not read, not only on one with rows', () => {
    // -1 is "unknown". A merge that skipped what it could not see would leave
    // rows pointing at an account it had just deleted.
    const blocked = blockingTables([count({ rows: -1, disposition: 'refuse', table: 'something_new' })]);
    expect(blocked).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The password in front of all three
// ---------------------------------------------------------------------------

describe('the step-up rules', () => {
  const now = Date.now();

  it('names the act in the prompt, so nobody types a password blind', () => {
    expect(stepUpPrompt('delete')).toMatch(/delete accounts/);
    expect(stepUpPrompt('merge')).toMatch(/merge accounts/);
    expect(stepUpPrompt('rename')).toMatch(/sign-in name/);
  });

  it('allows a few mistypes and then asks for a wait', () => {
    let attempts: number[] = [];
    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS - 1; i += 1) {
      attempts = recordAttempt(attempts, now);
      expect(tooManyAttempts(attempts, now)).toBe(false);
    }
    attempts = recordAttempt(attempts, now);
    expect(tooManyAttempts(attempts, now)).toBe(true);
  });

  it('lets the lock expire rather than stranding an administrator', () => {
    let attempts: number[] = [];
    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS; i += 1) attempts = recordAttempt(attempts, now);
    expect(tooManyAttempts(attempts, now)).toBe(true);
    expect(tooManyAttempts(attempts, now + WINDOW_MS + 1000)).toBe(false);
  });

  it('counts down in minutes', () => {
    const attempts = [now];
    expect(waitSeconds(attempts, now)).toBeGreaterThan(0);
    expect(lockedOutMessage(600)).toMatch(/10 minutes/);
    expect(lockedOutMessage(30)).toMatch(/a minute/);
  });

  it('says nothing was changed, in every refusal', () => {
    expect(wrongPasswordMessage()).toMatch(/nothing was changed/i);
    expect(lockedOutMessage(120)).toMatch(/nothing was changed/i);
  });
});

// ---------------------------------------------------------------------------
// Source guards
// ---------------------------------------------------------------------------

describe('the routes ask for the password', () => {
  it('delete refuses before it reads or writes anything', () => {
    const code = codeOf('src/app/api/users/delete/route.ts');
    expect(code).toContain("confirmAdminPassword(auth.me.id, body.password, 'delete')");
    // Before the loop that deletes, not inside it.
    const gate = code.indexOf('confirmAdminPassword');
    const loop = code.indexOf('for (const id of ids)');
    expect(gate).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(gate);
  });

  it('merge refuses before it merges anything', () => {
    const code = codeOf('src/app/api/users/merge/route.ts');
    const gate = code.indexOf('await confirmAdminPassword');
    const work = code.indexOf('mergeUserInto({');
    expect(gate).toBeGreaterThan(-1);
    expect(work).toBeGreaterThan(gate);
  });

  it('a merge preview needs no password, because it writes nothing', () => {
    const code = codeOf('src/app/api/users/merge/route.ts');
    const preview = code.indexOf('if (body.preview)');
    const gate = code.indexOf('await confirmAdminPassword');
    expect(preview).toBeGreaterThan(-1);
    expect(preview).toBeLessThan(gate);
    // The preview path must not write.
    const previewBlock = code.slice(preview, gate);
    expect(previewBlock).not.toMatch(/\.(create|update|delete|updateMany|deleteMany)\(/);
  });

  it('renaming asks only when the name actually changes', () => {
    const code = codeOf('src/app/api/users/[id]/route.ts');
    expect(code).toContain('previousUsername !== validatedData.username');
    const condition = code.indexOf('previousUsername !== validatedData.username');
    const gate = code.indexOf('await confirmAdminPassword');
    expect(gate).toBeGreaterThan(condition);
  });
});

describe('the merge engine', () => {
  const code = codeOf('src/lib/users/mergeEngine.ts');

  it('does everything in one transaction, delete included', () => {
    const tx = code.indexOf('$transaction');
    const del = code.indexOf('tx.user.delete');
    expect(tx).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(tx);
  });

  it('writes the audit entry while both accounts still exist', () => {
    expect(code.indexOf('auditLog.create')).toBeLessThan(code.indexOf('tx.user.delete'));
  });

  it('never deletes the account being kept', () => {
    expect(code).not.toMatch(/delete\(\{\s*where:\s*\{\s*id:\s*keepId/);
  });

  it('counts on the same snapshot it moves on', () => {
    // Scanned outside the transaction, a row written in the second between
    // the two would be left behind -- and a soft reference would not complain.
    const tx = code.indexOf('$transaction');
    const scan = code.indexOf('countReferences(tx,');
    expect(scan).toBeGreaterThan(tx);
  });

  it('stops before it writes when a table cannot be placed', () => {
    const blocked = code.indexOf('blockingTables');
    const firstWrite = code.indexOf('auditLog.create');
    expect(blocked).toBeGreaterThan(-1);
    expect(blocked).toBeLessThan(firstWrite);
  });

  it('fills the kept account only after the duplicate is gone', () => {
    // Otherwise a unique staff code moving across collides with the row it
    // came from, and the whole merge rolls back.
    expect(code.indexOf('tx.user.delete')).toBeLessThan(code.indexOf('tx.user.update'));
  });
});

describe('the password never leaves the moment it was typed', () => {
  const page = codeOf('src/app/dashboard/users/page.tsx');

  it('is not stored in the browser', () => {
    const near = page.slice(Math.max(0, page.indexOf('askPassword') - 2000));
    expect(near).not.toMatch(/localStorage|sessionStorage/);
  });

  it('is cleared when the box closes', () => {
    expect(page).toContain("setAskPassword('')");
  });

  it('keeps a wrong password from losing the pending work', () => {
    // The box stays open and the action is retried, rather than the screen
    // throwing away what was selected.
    expect(page).toContain('if (problem) { setAskError(problem); return; }');
  });
});
