import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  expectedReviewersFor,
  REVIEWER_SOURCE_LABEL,
  GRADE_LABEL,
} from '../../src/lib/anaesthesia/expectedReviewers';
import {
  buildReviewChaseMessage,
  registerForState,
  courtesyName,
  caseLine,
} from '../../src/lib/anaesthesia/reviewChaseMessage';
import { whatsappLink } from '../../src/lib/whatsapp';

const person = (name: string, phone: string | null, seniority: string | null) => ({
  userId: `id-${name}`,
  name,
  phone,
  seniority,
  role: null,
});

const team = (over: Partial<Record<string, any>> = {}) => ({
  subspecialty: 'Cardiothoracic Surgery',
  consultant: null,
  seniorRegistrar: null,
  registrar: null,
  members: [],
  source: 'subspecialty' as const,
  ...over,
});

const teamsOf = (byKey: Record<string, any>) => ({
  bySubspecialty: new Map(Object.entries(byKey)),
  onCall: team({ source: 'none' as const }),
});

describe('who is expected to review a case', () => {
  const sr = person('AKorede Olabode', '08035387995', 'SENIOR_REGISTRAR');
  const reg = person('Nwokeji Chiemeka', '09024119312', 'REGISTRAR');
  const cons = person('Okonna', null, 'CONSULTANT');

  it('names the registrar and senior registrar, not the consultant', () => {
    // THE BUG. The board named whoever was on the booking, which the booking
    // route fills with the consultant covering the specialty. So it asked the
    // consultant for the review and then recorded him as having missed the
    // 9pm deadline for work that was never his to do.
    const out = expectedReviewersFor({
      subspecialty: 'Cardiothoracic Surgery',
      teams: teamsOf({
        'cardiothoracic surgery': team({ consultant: cons, seniorRegistrar: sr, registrar: reg }),
      }),
      namedOnCase: cons,
    });
    expect(out.source).toBe('registrars');
    expect(out.reviewers.map((r) => r.name)).toEqual(['AKorede Olabode', 'Nwokeji Chiemeka']);
    expect(out.reviewers.map((r) => r.grade)).toEqual(['SENIOR_REGISTRAR', 'REGISTRAR']);
    expect(out.reviewers.some((r) => r.name === 'Okonna')).toBe(false);
  });

  it('shows both when both are rostered', () => {
    // The list is shared between them and either may take any case. Naming
    // one would make the other invisible on a board about accountability.
    const out = expectedReviewersFor({
      subspecialty: 'ENT',
      teams: teamsOf({ ent: team({ seniorRegistrar: sr, registrar: reg }) }),
    });
    expect(out.reviewers).toHaveLength(2);
  });

  it('falls back to the consultant, and says that is what happened', () => {
    const out = expectedReviewersFor({
      subspecialty: 'ENT',
      teams: teamsOf({ ent: team({ consultant: cons }) }),
    });
    expect(out.source).toBe('consultant-only');
    expect(out.reviewers[0].name).toBe('Okonna');
    expect(REVIEWER_SOURCE_LABEL['consultant-only']).toMatch(/no registrar rostered/i);
  });

  it('falls back to the booking, and does NOT dress it up as a roster', () => {
    // The hole-that-hides-itself case the whole board exists to show.
    const out = expectedReviewersFor({
      subspecialty: 'Neurosurgery',
      teams: teamsOf({}),
      namedOnCase: cons,
    });
    expect(out.source).toBe('named-on-case');
    expect(REVIEWER_SOURCE_LABEL['named-on-case']).toMatch(/not on the roster/i);
    expect(REVIEWER_SOURCE_LABEL['named-on-case']).not.toMatch(/rostered to this specialty/i);
  });

  it('says nobody rather than inventing somebody', () => {
    const out = expectedReviewersFor({ subspecialty: 'Urology', teams: teamsOf({}) });
    expect(out.reviewers).toHaveLength(0);
    expect(out.source).toBe('none');
  });

  it('matches the specialty however it is capitalised or spaced', () => {
    const out = expectedReviewersFor({
      subspecialty: '  CARDIOTHORACIC Surgery ',
      teams: teamsOf({ 'cardiothoracic surgery': team({ registrar: reg }) }),
    });
    expect(out.source).toBe('registrars');
  });

  it('survives a case with no specialty at all', () => {
    const out = expectedReviewersFor({ subspecialty: null, teams: teamsOf({}), namedOnCase: null });
    expect(out.source).toBe('none');
    expect(() => expectedReviewersFor({ subspecialty: undefined, teams: teamsOf({}) })).not.toThrow();
  });

  it('labels the grades for printing', () => {
    expect(GRADE_LABEL.SENIOR_REGISTRAR).toBe('Senior registrar');
    expect(GRADE_LABEL.REGISTRAR).toBe('Registrar');
    // An unknown grade prints nothing rather than the word "unknown" beside
    // a colleague's name.
    expect(GRADE_LABEL.UNKNOWN).toBe('');
  });
});

describe('which letter a case has earned', () => {
  it('chases only a case that has actually defaulted', () => {
    expect(registerForState('LAPSED')).toBe('MISSED');
    expect(registerForState('HANDBACK_WINDOW_CLOSED')).toBe('LATE');
  });

  it('refuses to chase anybody still within their window', () => {
    // Writing to somebody who is not yet late is how a chase stops being read.
    for (const s of ['AWAITING', 'AWAITING_REASSIGNMENT', 'REVIEWED', 'SETTLED', '']) {
      expect(registerForState(s), s).toBeNull();
    }
  });
});

describe('the message to a defaulting reviewer', () => {
  const base = {
    reviewerName: 'AKorede Olabode',
    patientName: 'Eze Ifunanya',
    folderNumber: '14538',
    procedureName: 'Left Cortical Mastoidectomy',
    surgeryDay: 'Tuesday, 3 November 2026',
    scheduledTime: '09:00',
    unit: 'ENT Unit I',
    surgeonName: 'Ethel Nkechi Chime',
    fromName: 'Theatre Management',
  };

  const missed = buildReviewChaseMessage({ ...base, register: 'MISSED' });
  const late = buildReviewChaseMessage({ ...base, register: 'LATE' });

  it('names the case so precisely that no second message is needed', () => {
    // An anaesthetist may have four cases on one list, and "your case has not
    // been reviewed" fits all of them.
    for (const m of [missed, late]) {
      expect(m).toContain('Eze Ifunanya');
      expect(m).toContain('14538');
      expect(m).toContain('Left Cortical Mastoidectomy');
      expect(m).toContain('ENT Unit I');
      expect(m).toContain('09:00');
      expect(m).toContain('Tuesday, 3 November 2026');
      expect(m).toContain('Ethel Nkechi Chime');
    }
  });

  it('appeals first and explains the implications second', () => {
    // A message that opens with consequences reads as an accusation and gets
    // answered last. The order is the point.
    const appeal = missed.indexOf('as a colleague');
    const implications = missed.indexOf('What this means');
    expect(appeal).toBeGreaterThan(-1);
    expect(implications).toBeGreaterThan(-1);
    expect(appeal).toBeLessThan(implications);
  });

  it('sends a lighter letter at 7pm than at 9pm', () => {
    // Four different letters, not one with a number swapped.
    expect(late).not.toContain('What this means');
    expect(late).toMatch(/deadline is approaching/i);
    expect(missed).toMatch(/9pm deadline has passed/i);
    expect(missed.length).toBeGreaterThan(late.length);
  });

  it('covers the case of a review done but never written down', () => {
    // The commonest version of this failure: the patient WAS seen, in a
    // corridor, and the assessment exists only in somebody's head.
    expect(missed).toMatch(/exists only in conversation/i);
    expect(missed).toMatch(/no record of work you have actually done/i);
    expect(late).toMatch(/already seen the patient/i);
  });

  it('states the duty to communicate the outcome to the surgical team', () => {
    expect(missed).toMatch(/communicate\s+the outcome to the surgical team/i);
    expect(missed).toMatch(/cannot be shown to have been communicated/i);
  });

  it('is legally serious without inventing law', () => {
    // A fabricated citation would discredit the whole message the first time
    // somebody checked it. The true facts are heavy enough.
    expect(missed).toMatch(/permanent record/i);
    expect(missed).toMatch(/auditable/i);
    expect(missed).toMatch(/adverse outcome/i);
    // No invented statutes, sections or penalties.
    expect(missed).not.toMatch(/section \d|cap\.? \d|act of \d{4}|\bdecree\b/i);
    expect(missed).not.toMatch(/you will be (sacked|dismissed|suspended|prosecuted)/i);
  });

  it('offers a way out and invites an explanation', () => {
    // A chase with no door is a chase that gets ignored.
    expect(missed).toContain('I cannot review this');
    expect(late).toContain('I cannot review this');
    expect(missed).toMatch(/if there is a reason/i);
  });

  it('is addressed courteously, and never "Dr Dr"', () => {
    expect(courtesyName('AKorede Olabode')).toBe('Dr AKorede Olabode');
    expect(courtesyName('Dr Okonna')).toBe('Dr Okonna');
    expect(courtesyName('Prof Eze')).toBe('Prof Eze');
    expect(courtesyName('  ')).toBe('Doctor');
    expect(courtesyName(null)).toBe('Doctor');
  });

  it('degrades honestly when the case details are thin', () => {
    const thin = buildReviewChaseMessage({ reviewerName: 'Okonna', register: 'MISSED' });
    expect(thin).toContain('a patient on your list');
    expect(thin).not.toContain('undefined');
    expect(thin).not.toContain('null');
    expect(caseLine({ reviewerName: 'x', register: 'LATE' })).not.toMatch(/undefined|null/);
  });

  it('survives the trip through a wa.me link intact', () => {
    // Newlines and ampersands must not truncate the query string.
    const href = whatsappLink('08035387995', missed);
    expect(href).toContain('https://wa.me/2348035387995?text=');
    expect(decodeURIComponent(href!.split('?text=')[1])).toBe(missed);
  });
});

describe('the board and the route agree', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('resolves the reviewers on the server, not in the browser', () => {
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    expect(route).toContain('expectedReviewersFor');
    expect(route).toContain('getAnaesthetistTeamsForDate');
  });

  it('recomputes lateness server-side rather than trusting the client', () => {
    // A client that could name the state could chase a colleague who is not
    // late at all.
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    const chase = route.slice(route.indexOf("if (action === 'chase')"));
    expect(chase).toContain('reviewWatchState');
    expect(chase).toContain('registerForState');
  });

  it('writes the record before handing back a link', () => {
    // A blocked pop-up must only ever leave a chase recorded-but-unsent.
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    const chase = route.slice(route.indexOf("if (action === 'chase')"));
    expect(chase.indexOf('notification.create')).toBeLessThan(chase.indexOf('return NextResponse.json({\n      ok: true,'));
    expect(chase).toContain('PREOP_REVIEW_CHASED');
  });

  it('restricts who may chase', () => {
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    expect(route).toContain('MAY_CHASE');
    const chase = route.slice(route.indexOf("if (action === 'chase')"));
    expect(chase).toMatch(/MAY_CHASE\.includes/);
  });

  it('shows the chase button only on a case that has defaulted', () => {
    const page = read('src/app/dashboard/preop-reviews/watch/page.tsx');
    expect(page).toMatch(/c\.state === 'LAPSED' \|\| c\.state === 'HANDBACK_WINDOW_CLOSED'/);
    // Every recipient gets a button, because a browser blocks every pop-up
    // but the first.
    expect(page).toContain('handoff.who.map');
  });
});
