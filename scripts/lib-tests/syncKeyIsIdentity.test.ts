/**
 * The same record, minted twice on two nodes.
 *
 * MEASURED, 25 November 2026. The theatre server held 13,023 parked
 * conflicts. 12,964 were four policy-review tables, accruing at about 2,200
 * a day since the round opened on 19 November, and every one said "row X
 * already holds this row's unique key".
 *
 * Both nodes had independently created a row for the same reviewer. The row
 * counts matched EXACTLY on the two databases — one participation per
 * invitation on each — so these were never two competing answers. They were
 * one answer minted twice, colliding on every keystroke, and they buried the
 * nine conflicts that were somebody's actual decision: one surgery, one
 * user, seven PACU assessments.
 *
 * The rule added for it is narrow on purpose, and the narrowness is what
 * these tests defend. Displacing a row means DELETING it; on `users` that is
 * an account other rows point at.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  KEY_IS_IDENTITY, TABLE_POLICIES, keyIsIdentity, policyFor,
} from '../../src/lib/sync/syncPolicy';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const POLICY_RESPONSE_TABLES = [
  'policy_participations',
  'policy_section_responses',
  'policy_general_responses',
  'policy_decision_item_responses',
];

describe('which tables may have a key taken from them', () => {
  it('names the four that were colliding, and only those', () => {
    expect(Object.keys(KEY_IS_IDENTITY).sort()).toEqual([...POLICY_RESPONSE_TABLES].sort());
  });

  it('never includes a table whose rows other rows point at', () => {
    // Displacing means deleting. On users that is an account referenced by
    // bookings, audit rows and sessions; on surgeries it is somebody's
    // booking. Neither is ever a duplicate of the other side's.
    for (const table of ['users', 'surgeries', 'patients', 'surgery_consumable_requests']) {
      expect(keyIsIdentity(table), table).toBe(false);
    }
  });

  it('only applies to tables the cloud is authoritative for', () => {
    // The rule is "the authoritative copy takes the key". On a table with no
    // single authority there is no copy entitled to take it.
    for (const table of Object.keys(KEY_IS_IDENTITY)) {
      expect(policyFor(table)?.cls, table).toBe('CLOUD_AUTHORITATIVE');
    }
  });

  it('only applies to tables that are actually synced', () => {
    for (const table of Object.keys(KEY_IS_IDENTITY)) {
      expect(TABLE_POLICIES.some((p) => p.table === table), table).toBe(true);
    }
  });

  it('says why, in enough words to be read by whoever changes it', () => {
    for (const [table, why] of Object.entries(KEY_IS_IDENTITY)) {
      expect(why.length, table).toBeGreaterThan(40);
    }
  });
});

describe('what the apply path does with a duplicate', () => {
  const apply = read('src/lib/sync/applyEntry.ts');

  it('lets the cloud copy take the key, rather than parking it again', () => {
    expect(apply).toContain('keyIsIdentity(e.table)');
    expect(apply).toContain("cls === 'CLOUD_AUTHORITATIVE' && keyIsIdentity(e.table)");
    expect(apply).toContain('the authoritative copy takes the key');
  });

  it('only for an entry that actually came from the cloud', () => {
    // A local change to a cloud-authoritative table does not get to delete
    // the cloud's row by claiming its key.
    expect(apply).toContain('e.originNode === CLOUD_NODE');
  });

  it('keeps the row it displaces', () => {
    // Every automatic displacement in this layer snapshots the loser first.
    // A rule that destroys something unreadably is not acceptable however
    // right it is.
    const branch = apply.slice(
      apply.indexOf('keyIsIdentity(e.table)'),
      apply.indexOf("} else if (cls === 'LWW')"),
    );
    expect(branch).toContain('displacedRival = rival');
    expect(branch).toContain('rivalId = rival.id');
  });

  it('leaves every other class exactly as it was', () => {
    // LWW still resolves by clock; everything else still goes to
    // earliestWins and then to a person.
    expect(apply).toContain("} else if (cls === 'LWW') {");
    expect(apply).toContain('earliestWins(');
    expect(apply).toContain('THE FIRST RECORD STANDS.');
  });
});

describe('the backlog sweep', () => {
  const script = read('scripts/local-server/clear-policy-conflicts.js');

  it('touches the same four tables the rule covers, and no others', () => {
    // The script runs under plain node on the server and cannot import the
    // TypeScript, so the list is duplicated. This is the test that keeps the
    // two in step.
    const block = script.slice(script.indexOf('const TABLES = ['), script.indexOf('];', script.indexOf('const TABLES = [')));
    for (const t of POLICY_RESPONSE_TABLES) expect(block, t).toContain(t);
    const named = Array.from(block.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(named.sort()).toEqual([...POLICY_RESPONSE_TABLES].sort());
  });

  it('changes nothing unless it is told to', () => {
    expect(script).toContain("const APPLY = process.argv.includes('--apply')");
    expect(script).toContain('Nothing changed. Re-run with --apply');
  });

  it('closes rather than deletes, and says the payload is kept', () => {
    // These rows are the record of a decision already taken. Deleting them
    // would throw away the only copy of what the other side sent.
    expect(script).toContain("set status = 'RESOLVED_KEEP_LOCAL'");
    expect(script).not.toMatch(/delete\s+from\s+sync_conflicts/i);
    expect(script).toContain('the incoming payload is kept on this row');
  });

  it('counts what it is leaving alone, which is the reason for doing it', () => {
    expect(script).toContain('Everything else, which this script leaves alone');
  });

  it('only ever touches OPEN rows', () => {
    expect(script).toContain("where status = 'OPEN' and table_name = any($1)");
  });
});
