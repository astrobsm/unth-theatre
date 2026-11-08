// Research access: a clinician sees their own cases, and anything wider is a
// decision the Theatre Research Board made and can be asked about.
//
// THE TEST THAT MATTERS MOST HERE IS THE FAIL-SAFE DIRECTION. When something
// is missing — no session, no user id, an expired grant — the scope must
// narrow, never widen. A bug in this file does not produce an error anybody
// notices; it produces a clinician quietly reading the free-text diagnoses of
// patients they have never met, and nothing on the screen looks wrong.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RESEARCH_BOARD_ROLES, RESEARCH_BOARD_ALSO, isResearchBoard,
  DECISION_HOURS, DEFAULT_GRANT_DAYS, RESEARCH_PURPOSES,
} from '../../src/lib/research/board';
import { withScope, researchScopeFor, type ResearchScope } from '../../src/lib/research/scope';
import { effectiveRoles } from '../../src/lib/roleGroups';
import { mayGenerateFor, LOGBOOK_FOR_OTHERS_ROLES } from '../../src/lib/logbook/access';
import { MODELS } from './schemaFields';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const schema = read('prisma/schema.prisma');

/** The UserRole enum, read from the schema. */
function schemaRoles(): Set<string> {
  const lines = schema.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === 'enum UserRole {');
  const out = new Set<string>();
  for (let i = start + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === '}') break;
    if (!t || t.startsWith('//') || t.startsWith('///')) continue;
    out.add(t.split(/\s/)[0]);
  }
  return out;
}

describe('the Theatre Research Board as named', () => {
  it('has all twelve seats', () => {
    expect(RESEARCH_BOARD_ROLES).toEqual([
      'THEATRE_CHAIRMAN', 'ETHICS_COMMITTEE_CHAIRMAN', 'THEATRE_MANAGER',
      'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_MAXILLOFACIAL',
      'HEAD_OF_ENT', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY', 'HEAD_OF_OPHTHALMOLOGY',
      'CMAC', 'HEAD_OF_OPERATIONS', 'HEAD_OF_PHARMACY',
    ]);
    expect(RESEARCH_BOARD_ROLES).toHaveLength(12);
  });

  it('every seat is a role an account can actually hold', () => {
    // Five of these did not exist before this change. A board member whose
    // role is not in the enum cannot be appointed, and the application would
    // arrive with nobody able to open it.
    const roles = schemaRoles();
    [...RESEARCH_BOARD_ROLES, ...RESEARCH_BOARD_ALSO].forEach((r) => {
      expect(roles.has(r), `${r} is not in the UserRole enum`).toBe(true);
    });
  });

  it('recognises a board member and does not recognise a surgeon', () => {
    expect(isResearchBoard('HEAD_OF_ENT')).toBe(true);
    expect(isResearchBoard('ETHICS_COMMITTEE_CHAIRMAN')).toBe(true);
    expect(isResearchBoard('CONSULTANT_SURGEON')).toBe(false);
    expect(isResearchBoard('SURGEON')).toBe(false);
    expect(isResearchBoard(null)).toBe(false);
    expect(isResearchBoard(undefined)).toBe(false);
  });

  it('keeps the module-access mirror in step with the roster', () => {
    // modules.ts carries its own copy to avoid a circular import. If the two
    // drift, a board member cannot open the screen their applications arrive
    // on, and nothing will be reviewed.
    const mods = read('src/lib/modules.ts');
    RESEARCH_BOARD_ROLES.forEach((r) => {
      expect(mods, `modules.ts does not grant research access to ${r}`).toContain(`'${r}'`);
    });
  });

  it('undertakes 24 hours and never grants permanently', () => {
    expect(DECISION_HOURS).toBe(24);
    expect(DEFAULT_GRANT_DAYS).toBeGreaterThan(0);
    expect(DEFAULT_GRANT_DAYS).toBeLessThanOrEqual(365);
    expect(RESEARCH_PURPOSES.length).toBeGreaterThan(3);
  });
});

describe('the clinical heads reach what their consultants reach', () => {
  it('maps each head to its consultant role', () => {
    const expected: Record<string, string> = {
      HEAD_OF_SURGERY: 'CONSULTANT_SURGEON',
      HEAD_OF_OBSTETRICS_GYNAECOLOGY: 'CONSULTANT_SURGEON',
      HEAD_OF_MAXILLOFACIAL: 'CONSULTANT_SURGEON',
      HEAD_OF_ENT: 'CONSULTANT_SURGEON',
      HEAD_OF_OPHTHALMOLOGY: 'CONSULTANT_SURGEON',
      HEAD_OF_ANAESTHESIA: 'CONSULTANT_ANAESTHETIST',
      HEAD_OF_PHARMACY: 'PHARMACIST',
    };
    Object.entries(expected).forEach(([head, consultant]) => {
      expect(effectiveRoles(head), `${head} should reach ${consultant}`).toContain(consultant);
    });
  });

  it('walks the chain, so a surgical head also reaches plain SURGEON', () => {
    // CONSULTANT_SURGEON already inherits SURGEON. Without the walk, a Head
    // of ENT would reach the consultant screens and not the ~127 places that
    // name SURGEON.
    expect(effectiveRoles('HEAD_OF_ENT')).toContain('SURGEON');
    expect(effectiveRoles('HEAD_OF_MAXILLOFACIAL')).toContain('SURGEON');
  });

  it('does not invent access the other way round', () => {
    expect(effectiveRoles('SURGEON')).toEqual(['SURGEON']);
    expect(effectiveRoles('CONSULTANT_SURGEON')).not.toContain('HEAD_OF_SURGERY');
  });
});

describe('the scope applied to every query', () => {
  const own: ResearchScope = {
    kind: 'OWN',
    where: { OR: [{ surgeonId: 'dr-a' }, { anesthetistId: 'dr-a' }] },
    explanation: '', grant: null, pending: null,
  };
  const board: ResearchScope = {
    kind: 'BOARD', where: null, explanation: '', grant: null, pending: null,
  };

  it('ANDs the scope in rather than merging it', () => {
    // A merge would flatten the scope's OR into the caller's filters, where
    // it would WIDEN them instead of narrowing them. That is the single most
    // dangerous shape this bug can take, and it looks like a tidy-up.
    const result = withScope({ status: 'COMPLETED' }, own);
    expect(result).toEqual({
      AND: [{ status: 'COMPLETED' }, { OR: [{ surgeonId: 'dr-a' }, { anesthetistId: 'dr-a' }] }],
    });
    expect(result.OR).toBeUndefined();
  });

  it('leaves the clause alone for somebody with no restriction', () => {
    expect(withScope({ status: 'COMPLETED' }, board)).toEqual({ status: 'COMPLETED' });
  });

  it('fails CLOSED when there is no user at all', async () => {
    // The direction that matters. A missing session must match no cases, not
    // every case -- and "no user" is exactly the state a half-built request
    // arrives in. This branch returns before it touches the database.
    const none = await researchScopeFor(null, null);
    expect(none.kind).toBe('OWN');
    expect(none.where).not.toBeNull();
    expect(none.where).toEqual({ id: '__no_user__' });

    const applied = withScope({ status: 'COMPLETED' }, none) as { AND: unknown[] };
    expect(applied.AND).toHaveLength(2);
  });

  it('never drops the caller’s own filters', () => {
    const base = { scheduledDate: { gte: new Date('2026-01-01') }, surgeryType: 'ELECTIVE' };
    const result = withScope(base, own) as { AND: unknown[] };
    expect(result.AND[0]).toBe(base);
  });
});

describe('every research route goes through the scope', () => {
  // The control is the where clause. Anything added to this module later must
  // pass through it, and this test is what says so to the next person.
  const routes = [
    'src/app/api/research/route.ts',
    'src/app/api/research/dataset/route.ts',
  ];

  it('calls researchScopeFor and applies it with withScope', () => {
    routes.forEach((r) => {
      const src = read(r);
      expect(src, `${r} does not resolve a scope`).toContain('researchScopeFor');
      expect(src, `${r} does not apply the scope`).toContain('withScope');
    });
  });

  it('leaves no surgery read unscoped', () => {
    // Counting withScope calls does not work once a helper is shared by two
    // scoped callers. What matters is that NO read has a bare where clause,
    // so each call site is checked for a clause that came from the scope.
    const SCOPED = /where:\s*(withScope|metaWhere|scopedWhere)/;
    routes.forEach((r) => {
      const src = read(r);
      const sites = src.split('surgery.findMany').slice(1);
      expect(sites.length, `${r} reads no surgeries`).toBeGreaterThan(0);
      sites.forEach((after, i) => {
        const window = after.slice(0, 220);
        expect(SCOPED.test(window),
          `${r}: surgery.findMany #${i + 1} has no scoped where clause`).toBe(true);
      });
    });
  });

  it('tells the client which scope was in force', () => {
    routes.forEach((r) => expect(read(r)).toContain('scope: { kind: scope'));
  });
});

describe('the log book is a person’s own record and nobody else’s', () => {
  it('lets somebody generate their own', () => {
    expect(mayGenerateFor('dr-a', 'HOUSE_OFFICER', 'dr-a')).toBe(true);
  });

  it('refuses every other combination, including a head of department', () => {
    expect(mayGenerateFor('dr-a', 'SURGEON', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'HEAD_OF_SURGERY', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'THEATRE_MANAGER', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'ADMIN', 'dr-b')).toBe(false);
  });

  it('refuses when there is no actor at all', () => {
    expect(mayGenerateFor(null, 'ADMIN', 'dr-b')).toBe(false);
    expect(mayGenerateFor(undefined, 'ADMIN', 'dr-b')).toBe(false);
    // And not even against an empty subject, which is the shape a missing id
    // takes on the way in.
    expect(mayGenerateFor(null, 'ADMIN', '')).toBe(false);
  });

  it('keeps the old trainer list visible but unused', () => {
    // Deliberately left in place so the decision reads as a decision rather
    // than as a list somebody forgot to wire up.
    expect(LOGBOOK_FOR_OTHERS_ROLES.length).toBeGreaterThan(0);
    const src = read('src/lib/logbook/access.ts');
    const body = src.slice(src.indexOf('export function mayGenerateFor'));
    expect(body).not.toContain('LOGBOOK_FOR_OTHERS_ROLES');
  });

  it('offers only the signed-in person in the picker', () => {
    const src = read('src/app/api/research/logbook/route.ts');
    expect(src).toContain('ownCasesOnly: true');
    expect(src).toContain('const people = me ? [me] : [];');
  });
});

describe('the request record carries what a decision needs', () => {
  it('stores the deadline, the granted scope and an expiry', () => {
    const fields = MODELS.get('ResearchAccessRequest');
    expect(fields, 'ResearchAccessRequest is not in the schema').toBeTruthy();
    ['dueBy', 'scopeRequested', 'scopeGranted', 'expiresAt', 'decidedById', 'decisionNote',
      'status', 'rationale', 'purpose']
      .forEach((f) => expect(fields!.has(f), `missing ${f}`).toBe(true));
  });

  it('syncs between the two deployments', () => {
    // A clinician may apply on one node and the board decide on the other.
    // Without capture, an approval would be invisible to the person who holds it.
    const fields = MODELS.get('ResearchAccessRequest')!;
    ['syncVersion', 'syncOrigin', 'syncHlc'].forEach((f) => expect(fields.has(f)).toBe(true));
    const mig = read('prisma/migrations/20261108120000_research_access_board/migration.sql');
    expect(mig).toContain("sync_enable_table('research_access_requests')");
  });
});
