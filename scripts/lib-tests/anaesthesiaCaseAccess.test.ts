import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decideCaseAccess,
  refusalMessage,
  ANAESTHETIST_ROLES,
  ANAESTHESIA_OVERSIGHT_ROLES,
} from '../../src/lib/anaesthesia/caseAccess';

const CONSULTANT = 'user-consultant-okeke';
const REGISTRAR = 'user-registrar-nwosu';
const STRANGER = 'user-registrar-eze';

const consultant = (parties: any) =>
  decideCaseAccess({ userId: CONSULTANT, role: 'CONSULTANT_ANAESTHETIST', parties });
const registrar = (parties: any) =>
  decideCaseAccess({ userId: REGISTRAR, role: 'ANAESTHETIST', parties });
const stranger = (parties: any) =>
  decideCaseAccess({ userId: STRANGER, role: 'ANAESTHETIST', parties });

describe('the four ways a case can be yours', () => {
  it('named as the anaesthetist on the booking', () => {
    const a = registrar({ anesthetistId: REGISTRAR });
    expect(a.attached).toBe(true);
    expect(a.reason).toBe('NAMED_ON_CASE');
    expect(a.mayView).toBe(true);
    expect(a.mayApprove).toBe(true);
  });

  it('recorded on the review as the consultant who will approve it', () => {
    // The normal working pattern: the registrar is named on the case and does
    // the review, and his consultant signs it off. A rule that recognised
    // only the booking would stop pharmacy packing until somebody reassigned
    // the case, which is why this way exists.
    const parties = {
      anesthetistId: REGISTRAR,
      reviews: [{ anesthetistId: REGISTRAR, consultantAnesthetistId: CONSULTANT }],
    };
    expect(consultant(parties).reason).toBe('SUPERVISING_CONSULTANT');
    expect(consultant(parties).mayApprove).toBe(true);
    expect(registrar(parties).reason).toBe('NAMED_ON_CASE');
  });

  it('wrote the review, though somebody else is named on the case', () => {
    const a = registrar({
      anesthetistId: 'somebody-else',
      reviews: [{ anesthetistId: REGISTRAR, consultantAnesthetistId: CONSULTANT }],
    });
    expect(a.reason).toBe('REVIEWED_IT');
    expect(a.mayView).toBe(true);
  });

  it('wrote a prescription on it', () => {
    const a = registrar({
      anesthetistId: 'somebody-else',
      prescriptions: [{ prescribedById: REGISTRAR }],
    });
    expect(a.reason).toBe('PRESCRIBED_FOR_IT');
    expect(a.mayApprove).toBe(true);
  });
});

describe('a case belonging to another anaesthetist', () => {
  // THE HOLE THIS CLOSES. Both approval routes checked the ROLE and nothing
  // else, so a registrar in Theatre 2 could sign off the drugs for a
  // neurosurgical case he had never seen.
  const someoneElses = {
    anesthetistId: REGISTRAR,
    reviews: [{ anesthetistId: REGISTRAR, consultantAnesthetistId: CONSULTANT }],
    prescriptions: [{ prescribedById: REGISTRAR }],
  };

  it('is neither visible nor approvable to an unrelated anaesthetist', () => {
    const a = stranger(someoneElses);
    expect(a.attached).toBe(false);
    expect(a.mayView).toBe(false);
    expect(a.mayApprove).toBe(false);
    expect(a.reason).toBe('NOT_YOURS');
  });

  it('is not opened up by being a consultant', () => {
    // Seniority is not attachment. A consultant who is not this case's
    // consultant has no more business approving it than anyone else.
    const other = decideCaseAccess({
      userId: 'user-consultant-other',
      role: 'CONSULTANT_ANAESTHETIST',
      parties: someoneElses,
    });
    expect(other.mayView).toBe(false);
    expect(other.mayApprove).toBe(false);
  });

  it('tells the refused person what to do instead of just "no"', () => {
    const msg = refusalMessage(stranger(someoneElses));
    expect(msg).toMatch(/not assigned to you/i);
    expect(msg).toMatch(/reviewed it|consultant recorded/i);
  });
});

describe('a case with nobody named on it', () => {
  const unclaimed = { anesthetistId: null };

  it('stays visible to every anaesthetist', () => {
    // A case no anaesthetist can see is a case that reaches theatre
    // unreviewed. Strict scoping would hide exactly the case that needs
    // chasing most.
    expect(registrar(unclaimed).mayView).toBe(true);
    expect(consultant(unclaimed).mayView).toBe(true);
    expect(stranger(unclaimed).mayView).toBe(true);
    expect(registrar(unclaimed).unclaimed).toBe(true);
  });

  it('is approvable by a consultant but not by a registrar', () => {
    // Somebody must be able to, or pharmacy can never pack the drugs. But
    // approval is a consultant's signature.
    expect(consultant(unclaimed).mayApprove).toBe(true);
    expect(registrar(unclaimed).mayApprove).toBe(false);
  });

  it('is never reported as attached, so the audit row cannot lie', () => {
    expect(consultant(unclaimed).attached).toBe(false);
    expect(consultant(unclaimed).reason).toBe('UNCLAIMED');
  });

  it('says why, and who can act', () => {
    expect(refusalMessage(registrar(unclaimed))).toMatch(/no anaesthetist is named/i);
  });
});

describe('everyone else', () => {
  it('lets the oversight roles see and act on the whole day', () => {
    // A theatre manager scoped to cases with her own name on them would see
    // nothing at all, and the board is how she runs the day.
    for (const role of ANAESTHESIA_OVERSIGHT_ROLES) {
      const a = decideCaseAccess({
        userId: 'user-manager',
        role,
        parties: { anesthetistId: REGISTRAR },
      });
      expect(a.mayView, role).toBe(true);
      expect(a.mayApprove, role).toBe(true);
      // Not "attached" -- it is not their case, and the record should say so.
      expect(a.attached, role).toBe(false);
    }
  });

  it('shuts out everyone who is neither an anaesthetist nor oversight', () => {
    for (const role of ['SURGEON', 'SCRUB_NURSE', 'PHARMACIST', 'PORTER', '', null]) {
      const a = decideCaseAccess({
        userId: STRANGER,
        role,
        parties: { anesthetistId: null },
      });
      expect(a.mayView, String(role)).toBe(false);
      expect(a.mayApprove, String(role)).toBe(false);
    }
  });

  it('does not let a blank user id match a blank field', () => {
    // An unauthenticated or malformed session must not become "the person
    // named on every case that names nobody".
    const a = decideCaseAccess({
      userId: '',
      role: 'ANAESTHETIST',
      parties: { anesthetistId: '', reviews: [{ anesthetistId: '', consultantAnesthetistId: '' }] },
    });
    expect(a.attached).toBe(false);
    expect(a.reason).toBe('UNCLAIMED');
  });
});

describe('the routes actually use the rule', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('guards the single prescription approval', () => {
    // The bulk endpoint always recomputed the caller's own cases. This one
    // trusted the id in the URL.
    const route = read('src/app/api/prescriptions/[id]/approve/route.ts');
    expect(route).toContain('caseAccessForSurgery');
    expect(route).toMatch(/!access\.mayApprove/);
  });

  it('guards the pre-op review approval', () => {
    const route = read('src/app/api/preop-reviews/[id]/approve/route.ts');
    expect(route).toContain('caseAccessForSurgery');
    expect(route).toMatch(/!access\.mayApprove/);
  });

  it('scopes the day board rather than filtering in the browser', () => {
    const route = read('src/app/api/anaesthesia/board/route.ts');
    expect(route).toContain('decideCaseAccess');
    expect(route).toContain('scopedToOwnCases');
    // The ids the rule reads must actually be selected, or every case looks
    // like somebody else's and the board goes empty.
    expect(route).toContain('consultantAnesthetistId: true');
    expect(route).toContain('prescribedById: true');
  });

  it('guards amending a prescription as well as approving one', () => {
    // Rewriting another team's drug chart is the same class of act as
    // signing it off, and checkAmendment only ever asked about the grade.
    const route = read('src/app/api/prescriptions/[id]/amend/route.ts');
    expect(route).toContain('caseAccessForSurgery');
    expect(route).toMatch(/!access\.mayApprove/);
  });

  it('keeps one list of who carries cases', () => {
    expect(ANAESTHETIST_ROLES).toEqual(['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST']);
  });
});
