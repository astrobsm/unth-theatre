/**
 * Who theatre rings for drugs, and the four different answers to that.
 *
 * The band exists because a case held up for drugs needs a person, not a
 * roster. So the thing worth testing is the CHAIN — rostered, then by role,
 * then the standing contact, then nobody — and the two places it would rather
 * guess than admit it does not know: a name that matches several people, and
 * a name with no number behind it.
 *
 * The shift is tested on the source as well as on behaviour. This machine is
 * Africa/Lagos, which IS WAT, so a device-clock reading produces identical
 * answers here and wrong ones on the theatre server, which runs UTC.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  resolvePharmacistOnDuty,
  chooseStandingContact,
  matchesStandingName,
  shiftForDay,
  STANDING_PHARMACY_CONTACT_NAME,
} from '../../src/lib/roster/pharmacistOnDuty';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const LIB = read('src/lib/roster/pharmacistOnDuty.ts');
const ROUTE = read('src/app/api/pharmacy/on-duty/route.ts');
const BAND = read('src/components/PharmacistOnDutyBand.tsx');
const PAGE = read('src/app/dashboard/surgeries/page.tsx');

const person = (name: string, phone: string | null, role = 'PHARMACIST') =>
  ({ userId: name, name, phoneNumber: phone, role });

const empty = { rostered: [], roleHolders: [], standingMatches: [] };

describe('the chain, in order', () => {
  it('names the rostered pharmacist when there is one', () => {
    const d = resolvePharmacistOnDuty({
      ...empty,
      rostered: [{ ...person('Chinwe O.', '08030000001'), shift: 'MORNING' }],
      roleHolders: [person('Somebody Else', '08030000002')],
    });
    expect(d.source).toBe('roster');
    expect(d.people.map((p) => p.name)).toEqual(['Chinwe O.']);
  });

  it('keeps a rostered pharmacist who has no number on file', () => {
    // The one step where unreachable still wins. They ARE on duty, the name is
    // enough to find them on the floor, and the alternative is quietly ringing
    // somebody who is not on and who cannot dispense anything.
    const d = resolvePharmacistOnDuty({
      ...empty,
      rostered: [person('Chinwe O.', null)],
      roleHolders: [person('Somebody Else', '08030000002')],
    });
    expect(d.source).toBe('roster');
    expect(d.people[0].phoneNumber).toBeNull();
  });

  it('names every pharmacist rostered for the shift, not just the first', () => {
    const d = resolvePharmacistOnDuty({
      ...empty,
      rostered: [person('A', '0803'), person('B', '0804')],
    });
    expect(d.people).toHaveLength(2);
  });

  it('falls back to the pharmacist on record when nobody is rostered', () => {
    const d = resolvePharmacistOnDuty({
      ...empty,
      roleHolders: [person('On Record', '08030000003')],
      standingMatches: [person('Ayogu', '08030000004')],
    });
    expect(d.source).toBe('role');
    expect(d.people[0].name).toBe('On Record');
  });

  it('skips a role holder who has no number, because that is the whole point', () => {
    // By-role is already a guess. A guess nobody can ring is not worth making,
    // and it would shadow a standing contact who CAN be reached.
    const d = resolvePharmacistOnDuty({
      ...empty,
      roleHolders: [person('No Phone', null)],
      standingMatches: [person('Ayogu', '08030000004')],
    });
    expect(d.source).toBe('standing');
    expect(d.people[0].name).toBe('Ayogu');
  });

  it('falls back to the standing contact when there is no pharmacist at all', () => {
    const d = resolvePharmacistOnDuty({
      ...empty,
      standingMatches: [person('Ayogu Chidi', '08030000005', 'PHARMACY_TECHNICIAN')],
    });
    expect(d.source).toBe('standing');
    expect(d.people[0].phoneNumber).toBe('08030000005');
  });

  it('says there is nobody rather than inventing one', () => {
    const d = resolvePharmacistOnDuty({ ...empty });
    expect(d.source).toBe('none');
    expect(d.people).toEqual([]);
  });
});

describe('the standing contact is a name, not a number', () => {
  it('defaults to Ayogu', () => {
    expect(STANDING_PHARMACY_CONTACT_NAME).toBe('Ayogu');
  });

  it('never has a phone number written into the source', () => {
    // THE test here. A number pasted into this file is correct until the day
    // that person changes SIM, and nothing anywhere would say so. The number
    // comes from their user record; PHARMACY_FALLBACK_PHONE covers the case
    // where the standing contact is not a user of the system at all.
    //
    // Matches a Nigerian mobile written any of the ways people write it.
    expect(LIB).not.toMatch(/(?:\+?234|0)\d[\d\s-]{8,}/);
    expect(LIB).toContain('PHARMACY_FALLBACK_PHONE');
  });

  it('uses a configured number only when nobody answers to the name', () => {
    const d = resolvePharmacistOnDuty({
      ...empty,
      configuredPhone: '08030000006',
      standingName: 'Ayogu',
    });
    expect(d.source).toBe('standing');
    expect(d.people[0].name).toBe('Ayogu');
    expect(d.people[0].phoneNumber).toBe('08030000006');
  });

  it('prefers the person over the configured number', () => {
    // Their own record is the one that changes when they change their number.
    const d = resolvePharmacistOnDuty({
      ...empty,
      standingMatches: [person('Ayogu', '08030000007')],
      configuredPhone: '08039999999',
    });
    expect(d.people[0].phoneNumber).toBe('08030000007');
  });
});

describe('a name that matches several people', () => {
  it('picks the pharmacist when exactly one of them is', () => {
    const { person: chosen, ambiguous } = chooseStandingContact([
      person('Ayogu Grace', '0801', 'NURSE'),
      person('Ayogu Chidi', '0802', 'PHARMACIST'),
    ]);
    expect(ambiguous).toBe(false);
    expect(chosen?.name).toBe('Ayogu Chidi');
  });

  it('refuses rather than ringing a stranger', () => {
    // Two people, neither a pharmacist. Guessing here puts a surgeon on the
    // phone to somebody who has nothing to do with the drugs, at 3 a.m., and
    // the band would look exactly as confident as it does when it is right.
    const { person: chosen, ambiguous } = chooseStandingContact([
      person('Ayogu Grace', '0801', 'NURSE'),
      person('Ayogu Emeka', '0802', 'PORTER'),
    ]);
    expect(chosen).toBeNull();
    expect(ambiguous).toBe(true);
  });

  it('carries the ambiguity out so the band can say so', () => {
    const d = resolvePharmacistOnDuty({
      ...empty,
      standingMatches: [
        person('Ayogu Grace', '0801', 'NURSE'),
        person('Ayogu Emeka', '0802', 'PORTER'),
      ],
      configuredPhone: '08039999999',
    });
    expect(d.source).toBe('none');
    expect(d.ambiguous).toBe(true);
    // And the configured number does NOT rescue it: the ambiguity is about
    // who the standing contact IS, and a number cannot settle that.
    expect(d.people).toEqual([]);
  });

  it('ignores a match with no number', () => {
    const { person: chosen } = chooseStandingContact([
      person('Ayogu Grace', null, 'NURSE'),
      person('Ayogu Chidi', '0802', 'PHARMACIST'),
    ]);
    expect(chosen?.name).toBe('Ayogu Chidi');
  });
});

describe('matching the standing name', () => {
  it('matches on a whole name part, in any case', () => {
    expect(matchesStandingName('AYOGU GRACE', 'Ayogu')).toBe(true);
    expect(matchesStandingName('Grace Ayogu', 'ayogu')).toBe(true);
    expect(matchesStandingName('Grace, Ayogu', 'Ayogu')).toBe(true);
  });

  it('does not match an unrelated name', () => {
    expect(matchesStandingName('Grace Okafor', 'Ayogu')).toBe(false);
    expect(matchesStandingName('', 'Ayogu')).toBe(false);
  });
});

describe('which shift the band speaks for', () => {
  // 12 Nov 2026, 09:30 WAT (08:30 UTC)
  const MORNING = new Date('2026-11-12T08:30:00Z');

  it('is the shift running now, but only for today', () => {
    expect(shiftForDay('2026-11-12', MORNING)).toBe('MORNING');
    expect(shiftForDay('2026-11-14', MORNING)).toBeNull();
    expect(shiftForDay('2026-11-10', MORNING)).toBeNull();
  });

  it('reads the hospital clock, not the device', () => {
    // 00:30 WAT on the 13th is 23:30 UTC on the 12th. Reading UTC would call
    // today the 12th and show the schedule a shift from the wrong day, at the
    // hour when the person who answers the phone has just changed.
    const lateNight = new Date('2026-11-12T23:30:00Z');
    expect(shiftForDay('2026-11-12', lateNight)).toBeNull();
    expect(shiftForDay('2026-11-13', lateNight)).toBe('NIGHT');
  });

  it('never asks the device what time it is', () => {
    // CHECKED ON THE SOURCE, deliberately: this machine is Africa/Lagos, which
    // IS WAT, so a getHours() implementation passes every assertion above and
    // is wrong on the server. Verified before by planting exactly that.
    expect(LIB).not.toContain('getTimezoneOffset');
    expect(LIB).not.toContain('getHours');
    expect(LIB).toContain("from '@/lib/watDay'");
  });
});

describe('the route only fetches, and only what it needs', () => {
  it('leaves the decision to the resolver', () => {
    // The chain was extracted because a gate written inline in a handler
    // cannot be tested: asserting the `if` "still looks right" passes just as
    // happily when the condition is wrapped in `false &&`.
    expect(ROUTE).toContain('resolvePharmacistOnDuty(');
    expect(ROUTE).not.toMatch(/source:\s*'role'/);
    expect(ROUTE).not.toMatch(/source:\s*'standing'/);
  });

  it('reads only PUBLISHED roster rows', () => {
    // A DRAFT roster is somebody's working copy. Naming a pharmacist off one
    // sends theatre to a person who has not been told they are on.
    expect(ROUTE).toContain("status: 'PUBLISHED'");
  });

  it('does not run the fallback queries when somebody is rostered', () => {
    expect(ROUTE).toContain('if (rostered.length === 0)');
  });

  it('narrows the substring match to whole name parts', () => {
    // Prisma `contains` would match any name with the letters in it.
    expect(ROUTE).toContain('matchesStandingName(');
  });
});

describe('the band', () => {
  it('is on the surgery schedule, next to the supervisor band', () => {
    expect(PAGE).toContain('<PharmacistOnDutyBand date={dateFilter} />');
    expect(PAGE).toContain("import PharmacistOnDutyBand from '@/components/PharmacistOnDutyBand'");
  });

  it('says which answer it is showing', () => {
    // "Rostered this shift" and "the standing contact" are different promises.
    expect(BAND).toContain('Nobody is rostered');
    expect(BAND).toContain('On duty');
  });

  it('says when a name has no number rather than drawing a dead link', () => {
    expect(BAND).toContain('(no phone on file)');
  });

  it('renders nothing when it could not load, instead of claiming nobody', () => {
    // A failed fetch and an empty roster must not look the same: one is a
    // problem with the page, the other is a problem with the day.
    expect(BAND).toContain('if (!date || !loaded || !data) return null;');
  });
});
