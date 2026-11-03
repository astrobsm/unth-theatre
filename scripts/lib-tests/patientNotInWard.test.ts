/**
 * The patient was not in the ward.
 *
 * Reported from theatre on 3 November, in the words of the anaesthetist who
 * hit it: "my two urology cases for tomorrow aren't available in the assigned
 * ward, so I assume they might just be day cases. If I click on 'Not in the
 * ward', it still takes me to the next page, where I have to declare the
 * patient 'Fit or Not Fit for Surgery'. Since I haven't seen the patient, I
 * can't say whether they are fit or not. So the review cannot continue and
 * it'll just appear as if the patient wasn't reviewed."
 *
 * Two separate wrongs in that, and these hold both shut:
 *
 *   A FORM THAT ASKS FOR A DECISION NOBODY CAN MAKE. Nothing in here can test
 *   a React form, so the page tests are at the bottom, reading the source for
 *   the two things that must be true of it: the next section is unreachable
 *   while the patient is absent, and there is an action that is not "declare
 *   them fit".
 *
 *   A RECORD THAT BLAMES THE WRONG PERSON. That half is pure, and most of
 *   this file is about it. The anaesthetist who walked to the ward must not
 *   be summoned, the case must not read as reviewed, and the finding must
 *   land on whoever listed a patient who was not there.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  reviewWatchState,
  accountableFor,
  roleAccountableFor,
  needsHodNotice,
  type ReviewWatchInput,
} from '../../src/lib/anaesthesia/reviewWatch';
import {
  summariseReviewLocation,
  fixColumns,
  tidyReason,
} from '../../src/lib/anaesthesia/reviewLocation';
import { buildPatientAbsentMessage } from '../../src/lib/anaesthesia/patientAbsentMessage';
import { HOSPITAL_CENTRE } from '../../src/lib/theatreOps/geofence';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/** A WAT wall-clock moment as the UTC instant it really is. WAT is UTC+1. */
const wat = (iso: string) => new Date(`${iso}+01:00`);

const SURGERY_DAY = '2026-11-04';

const base: ReviewWatchInput = {
  surgeryDate: `${SURGERY_DAY}T00:00:00.000Z`,
  bookedAt: '2026-11-01T09:00:00.000Z',
  status: 'SCHEDULED',
  expectedReviewerId: 'registrar-1',
  assignmentSource: 'subspecialty',
};

const attended: ReviewWatchInput = {
  ...base,
  patientAbsentAt: wat(`2026-11-03T16:40:00`),
  patientAbsentById: 'registrar-1',
};

describe('attending and finding nobody is a state of its own', () => {
  it('is not "awaiting review" once somebody has been', () => {
    // Before this existed the case sat in AWAITING all evening and then
    // lapsed, with nothing anywhere recording that a doctor had walked over.
    expect(reviewWatchState(base, wat('2026-11-03T17:00:00'))).toBe('AWAITING');
    expect(reviewWatchState(attended, wat('2026-11-03T17:00:00')))
      .toBe('PATIENT_NOT_IN_WARD');
  });

  it('is NOT counted as reviewed', () => {
    // The single most important line in this file. A status that quietly
    // closed the case would hide an unseen patient from the team operating
    // on them in the morning, which is far worse than the complaint it set
    // out to fix.
    expect(reviewWatchState(attended, wat('2026-11-03T20:00:00')))
      .not.toBe('REVIEWED');
  });

  it('still lapses at 9pm, because the patient still has not been seen', () => {
    expect(reviewWatchState(attended, wat('2026-11-03T21:30:00'))).toBe('LAPSED');
  });

  it('gives way to a real review done later the same evening', () => {
    // The patient turns up at 7pm and the registrar goes back. The review is
    // the fact that matters from then on.
    const reviewed = { ...attended, reviewedAt: wat('2026-11-03T19:15:00') };
    expect(reviewWatchState(reviewed, wat('2026-11-03T20:00:00'))).toBe('REVIEWED');
  });

  it('outranks a handback, being the later and more specific fact', () => {
    const both = { ...attended, handedBackAt: wat('2026-11-03T14:00:00') };
    expect(reviewWatchState(both, wat('2026-11-03T18:00:00')))
      .toBe('PATIENT_NOT_IN_WARD');
  });

  it('stops mattering once the case is cancelled or already operated', () => {
    expect(reviewWatchState({ ...attended, status: 'CANCELLED' }, wat('2026-11-03T22:00:00')))
      .toBe('SETTLED');
  });
});

describe('who answers for a patient who was never produced', () => {
  const who = accountableFor(attended);

  it('is not the anaesthetist who went to the ward', () => {
    // The whole point. One undeserved summons and every later one is noise.
    expect(who?.userId).toBeNull();
    expect(who?.ground).toBe('patient-not-produced');
    expect(who?.ground).not.toBe('did-not-review');
  });

  it('names the booking, not the anaesthetic department', () => {
    // roleAccountableFor returns a ROLE only for findings that belong to the
    // HOD. This one belongs to whoever listed the patient, and the caller has
    // the surgery to find them from -- the same shape as booked-too-late.
    expect(roleAccountableFor('patient-not-produced')).toBeNull();
    expect(roleAccountableFor('rota-gap')).toBe('HEAD_OF_ANAESTHESIA');
  });

  it('says what has to happen next, in the summons itself', () => {
    expect(who?.reason).toMatch(/was not in the ward/i);
    expect(who?.reason).toMatch(/day case/i);
  });

  it('is not raised at all once the review exists', () => {
    expect(accountableFor({ ...attended, reviewedAt: wat('2026-11-03T19:15:00') })).toBeNull();
  });

  it('still excuses a case booked too late to review at all', () => {
    // A late booking is checked first and stays first: nobody could have
    // reviewed a case that did not exist, and that includes attending it.
    const late = { ...attended, bookedAt: wat('2026-11-03T20:30:00') };
    expect(accountableFor(late)?.ground).toBe('booked-too-late');
  });
});

describe('the HOD is told, because the case is still unreviewed', () => {
  it('appears in the 7pm notice', () => {
    // At 7pm a patient who is not yet admitted can still be sent for. Told at
    // 9pm it is a finding; told at 7pm it is a thing somebody can fix.
    expect(needsHodNotice(attended, wat('2026-11-03T19:05:00'))).toBe(true);
  });

  it('is not raised about a case booked after the window', () => {
    const late = { ...attended, bookedAt: wat('2026-11-03T20:30:00') };
    expect(needsHodNotice(late, wat('2026-11-03T20:45:00'))).toBe(false);
  });
});

describe('where the anaesthetist was standing', () => {
  // A point a few metres from the recorded campus centre, and one in Enugu
  // town about 14 km away.
  const atHospital = { latitude: HOSPITAL_CENTRE.latitude, longitude: HOSPITAL_CENTRE.longitude, accuracyM: 18 };
  const inTown = { latitude: 6.4584, longitude: 7.5464, accuracyM: 20 };

  it('corroborates a visit made on site', () => {
    const s = summariseReviewLocation(atHospital, 'The visit was recorded');
    expect(s.verdict).toBe('ON_SITE');
    expect(s.corroborated).toBe(true);
    expect(s.mapUrl).toContain(String(HOSPITAL_CENTRE.latitude));
  });

  it('does not call a position off site a lie', () => {
    const s = summariseReviewLocation(inTown);
    expect(s.verdict).toBe('OFF_SITE');
    expect(s.corroborated).toBe(false);
    // A handset left in the changing room reads exactly the same way.
    expect(s.sentence).toMatch(/question to ask rather than an answer/i);
  });

  it('says "no position" without saying "no visit"', () => {
    const s = summariseReviewLocation(
      { latitude: null, longitude: null, accuracyM: null, unavailableReason: 'Location permission denied on this handset' },
      'The visit was recorded',
    );
    expect(s.hasFix).toBe(false);
    expect(s.verdict).toBe('NO_FIX');
    expect(s.mapUrl).toBeNull();
    // The reason is attributed to the device, which is where it belongs.
    expect(s.sentence).toContain('Location permission denied on this handset');
    expect(s.sentence).not.toMatch(/did not|failed to attend|claims/i);
  });

  it('refuses to place a fix too vague to place', () => {
    // Phone-network positioning indoors is routinely a kilometre wide. Drawing
    // a marker from it would put staff on either side of the fence at random.
    const s = summariseReviewLocation({ ...atHospital, accuracyM: 1800 });
    expect(s.verdict).toBe('IMPRECISE');
    expect(s.distanceM).toBeNull();
    expect(s.corroborated).toBe(false);
  });

  it('treats 0,0 and a NaN as no fix, not as a doctor at sea', () => {
    expect(summariseReviewLocation({ latitude: 0, longitude: 0, accuracyM: 5 }).verdict).toBe('NO_FIX');
    expect(summariseReviewLocation({ latitude: Number.NaN, longitude: 7.5, accuracyM: 5 }).verdict).toBe('NO_FIX');
  });
});

describe('what gets written to the row', () => {
  it('computes the verdict rather than believing the client', () => {
    // A browser that could name its own verdict could claim to have been at
    // the bedside from anywhere, which would make the whole record worthless.
    const cols = fixColumns({
      latitude: 6.4584, longitude: 7.5464, accuracyM: 20,
      // A client trying it on. Nothing reads this field but the test.
      ...({ fixVerdict: 'ON_SITE' } as Record<string, unknown>),
    } as never);
    expect(cols.fixVerdict).toBe('OFF_SITE');
  });

  it('keeps no coordinates when there is no usable fix', () => {
    const cols = fixColumns({ latitude: 0, longitude: 0, accuracyM: 5, unavailableReason: 'No GPS fix' });
    expect(cols.latitude).toBeNull();
    expect(cols.longitude).toBeNull();
    expect(cols.unavailableReason).toBe('No GPS fix');
  });

  it('drops a leftover reason when a position did arrive', () => {
    // A reason beside a good fix reads as a doubt about a record that is fine.
    const cols = fixColumns({
      latitude: HOSPITAL_CENTRE.latitude, longitude: HOSPITAL_CENTRE.longitude,
      accuracyM: 12, unavailableReason: 'stale state from a previous attempt',
    });
    expect(cols.unavailableReason).toBeNull();
    expect(cols.fixVerdict).toBe('ON_SITE');
  });

  it('does not let a reason grow into an essay', () => {
    expect(tidyReason('x'.repeat(400))).toHaveLength(200);
    expect(tidyReason('   ')).toBeNull();
  });
});

describe('the message to the surgical team', () => {
  const msg = buildPatientAbsentMessage({
    recipientName: 'Dr Okonkwo',
    attendedByName: 'Dr Eze',
    patientName: 'Mrs A Nwosu',
    folderNumber: 'UNTH/2026/4411',
    ward: 'Urology Ward',
    procedureName: 'Transurethral resection of prostate',
    surgeryDay: 'Wednesday, 4 November 2026',
    scheduledTime: '08:30',
    attendedAtLabel: '16:40',
    reason: 'The ward says she has not been admitted.',
  });

  it('states the facts and asks one question', () => {
    expect(msg).toContain('Urology Ward');
    expect(msg).toContain('16:40');
    expect(msg).toContain('Dr Eze');
    expect(msg).toMatch(/not been admitted/);
    expect(msg).toMatch(/day case/i);
  });

  it('threatens nothing', () => {
    // It arrives on a consultant surgeon's phone from a registrar in
    // anaesthesia. A message that implied he had failed would be answered
    // with an argument instead of a patient.
    expect(msg).not.toMatch(/summons|audit|sanction|indict|disciplin/i);
    expect(msg).not.toMatch(/you (failed|did not|neglected)/i);
  });

  it('survives a case with nothing filled in', () => {
    const bare = buildPatientAbsentMessage({
      recipientName: null, attendedByName: null, patientName: null,
      folderNumber: null, ward: null, procedureName: null,
      surgeryDay: 'Wednesday, 4 November 2026', attendedAtLabel: '16:40',
      reason: 'Bed empty.',
    });
    expect(bare).not.toContain('null');
    expect(bare).not.toContain('undefined');
    expect(bare).toContain('Dear Colleague');
  });
});

describe('the form no longer asks for a decision nobody can make', () => {
  const page = read('src/app/dashboard/preop-reviews/new/page.tsx');

  it('will not advance to Fitness while the patient is absent', () => {
    // The reported fault exactly: "it still takes me to the next page, where
    // I have to declare the patient Fit or Not Fit for Surgery."
    expect(page).toMatch(/if \(n === 0 && !patientInWard\)/);
    const guard = page.slice(page.indexOf('if (n === 0 && !patientInWard)'));
    expect(guard.slice(0, 600)).toContain('return false');
  });

  it('offers recording the visit instead', () => {
    expect(page).toContain('recordPatientAbsent');
    expect(page).toContain("action: 'patient-absent'");
    expect(page).toMatch(/I attended and the patient was not in the ward/);
  });

  it('takes a position with it, and never requires one', () => {
    expect(page).toContain('requestFix');
    expect(page).toContain('reviewerFix');
    // No branch may refuse to submit because a fix is missing.
    expect(page).not.toMatch(/if \(!fix\b[^)]*\)\s*\{[^}]*return/);
  });
});

describe('the position helper cannot block a submit', () => {
  const src = read('src/lib/geo/requestFix.ts');

  it('has no rejection path at all', () => {
    // The lesson from the anaesthesia setup log: a technician standing in the
    // theatre, unable to record that she had set it up, because the gate
    // wanted a satellite. A promise that can reject will eventually be used
    // as a gate by somebody.
    expect(src).not.toMatch(/\breject\s*\(/);
    expect(src).toContain('Promise<CapturedFix>');
  });

  it('names plain http as the cause when the browser refuses outright', () => {
    // On the theatre server, reached by IP, Chrome reports PERMISSION_DENIED
    // with no prompt and no way for anybody to grant it.
    expect(src).toContain('isSecureContext');
    expect(src).toMatch(/not on a secure \(https\) address/);
  });

  it('always answers within its own timeout', () => {
    expect(src).toContain('setTimeout');
    expect(src).toContain('FIX_TIMEOUT_MS');
  });
});

describe('the duty measure leaves these cases out', () => {
  const src = read('src/lib/dutyPerformance/collect.ts');

  it('neither counts them done nor charges them as missed', () => {
    // Counting it done would be a false assurance; counting it missed would
    // charge a doctor for an empty bed, and a figure like that teaches people
    // to ignore the whole scheme.
    expect(src).toContain('if (r.patientAbsentAt && !r.reviewedAt) return;');
    expect(src).toContain('patientAbsentAt: true');
  });
});
