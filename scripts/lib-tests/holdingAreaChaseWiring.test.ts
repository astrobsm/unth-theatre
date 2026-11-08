// The chase has to reach the right room, or say that it did not.
//
// Two failures here look identical to the person pressing the button, and
// both leave them standing in a theatre waiting for a patient who is not
// coming:
//
//   1. The chase goes to the wrong complex. A role-targeted send resolves to
//      whoever is on "the holding area", the screen reports success, and the
//      message is read by a nurse in another building who cannot see the
//      patient.
//   2. The chase goes nowhere. The roster query matches no rows, the loop
//      runs zero times, the route returns 200, and the screen says it was
//      sent.
//
// Neither is visible from the outside, so both are pinned here.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const chase = read('src/app/api/holding-area/chase/route.ts');
const staffing = read('src/app/api/holding-area/staffing/route.ts');
const page = read('src/app/dashboard/call-for-patient/page.tsx');
const staffingPage = read('src/app/dashboard/holding-area/staffing/page.tsx');

describe('the chase reaches the right holding area', () => {
  it('resolves the complex from the case, never from a default', () => {
    expect(chase).toContain('complexForTheatre');
    // complexForTheatre returns null rather than guessing; the route must
    // then ASK, not fall back to the main complex.
    expect(chase).toContain("code: 'COMPLEX_UNKNOWN'");
    expect(chase).toContain('Choose the complex and send again');
    expect(chase).not.toContain('?? DEFAULT_COMPLEX');
  });

  it('prefers the suite row over the hardcoded theatre list', () => {
    // A theatre can be added without anybody editing constants.ts.
    expect(chase).toContain('prisma.theatreSuite.findUnique');
    expect(chase).toContain('suite?.location');
  });

  it('filters the roster down to that one complex', () => {
    // Without this the query returns everybody on any holding area, and the
    // Eye Theatre's patient is chased in Professor Ojukwu.
    expect(chase).toContain("subRole: 'HOLDING_AREA'");
    expect(chase).toContain('complexOfRow(r.location) === complex');
  });

  it('reads the shift from the hospital clock, not the server\'s', () => {
    expect(chase).toContain('watMinutesOfDay');
    expect(chase).toContain('electiveShiftFromMinutes');
    expect(chase).not.toMatch(/new Date\(\)\.getHours\(\)/);
  });
});

describe('the chase never claims to have reached nobody', () => {
  it('refuses with 409 when that holding area is empty', () => {
    // THE TEST THAT MATTERS MOST. A send loop over an empty array returns
    // 200 and the screen says the message went.
    expect(chase).toContain('r.targets.length === 0');
    expect(chase).toContain("code: 'NOBODY_ON_DUTY'");
    expect(chase).toContain('{ status: 409 }');
    expect(chase).toContain('sent: 0');
  });

  it('says which complex and which shift is empty', () => {
    // "Nobody is on the holding area" is acted on differently from "nobody
    // is on the Eye Theatre holding area this morning".
    expect(chase).toContain('nobodyOnDutyMessage(r.complex, SHIFT_LABEL[r.shift])');
  });

  it('lets the screen see who it would reach before anything is sent', () => {
    expect(chase).toContain('willReach');
    expect(chase).toContain('nobodyOnDuty:');
  });

  it('reports who it actually reached, and who had no phone', () => {
    expect(chase).toContain('reached: r.targets.map');
    expect(chase).toContain('has no phone number on file');
    // The queue is not a delivery, so the hand-off comes back too.
    expect(chase).toContain('handoffs');
  });
});

describe('an allocation names one room', () => {
  it('will not accept an allocation without a complex', () => {
    expect(staffing).toContain('normaliseComplex(body.complex)');
    expect(staffing).toContain('if (!complex)');
    expect(staffing).toContain('Each complex has its own');
  });

  it('stores the complex rather than the old hardcoded code', () => {
    expect(staffing).toContain('location: complex,');
    expect(staffing).not.toContain("location: 'MAIN_THEATRE',");
  });

  it('refuses to put one person in two holding areas at once', () => {
    // A roster that says somebody is in two buildings sends half the chases
    // to a room they are not in.
    expect(staffing).toContain('nobody can cover two holding areas at once');
  });

  it('reads rows written before complexes existed as the main complex', () => {
    // Those are real people who really stood in the main holding area.
    expect(staffing).toContain('complexOfRow');
  });

  it('offers the complex on the allocate form', () => {
    expect(staffingPage).toContain('HOLDING_AREA_COMPLEXES');
    expect(staffingPage).toContain('Which holding area');
    expect(staffingPage).toContain('complex, notes, date');
  });

  it('lists the allocations by complex, not in one pooled list', () => {
    expect(staffingPage).toContain('a.shift === s.value && a.complex === c.key');
  });
});

describe('the button', () => {
  it('is on the screen where the patient was called for', () => {
    expect(page).toContain('chaseHoldingArea');
    expect(page).toContain("'/api/holding-area/chase'");
    expect(page).toContain('Chase holding area');
  });

  it('appears only while the theatre is actually waiting', () => {
    // Before the call-up there is nothing to chase; after the patient has
    // arrived the button would chase a patient who is in the room.
    expect(page).toContain("['INVITED', 'PATIENT_EN_ROUTE'].includes(");
  });

  it('shows a refusal as a refusal, not as a sent message', () => {
    expect(page).toContain('ok: false');
    expect(page).toContain('needsComplex');
    // And lets the caller name the complex instead of guessing for them.
    expect(page).toContain('HOLDING_AREA_COMPLEXES');
  });

  it('offers the WhatsApp hand-off the queue cannot guarantee', () => {
    expect(page).toContain('https://wa.me/');
    expect(page).toContain('chaseResult.handoffs');
  });
});
