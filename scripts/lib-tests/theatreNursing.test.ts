// The theatre nursing posts: the main-theatre emergency pair, the A/E pair,
// and the nurse supervisors.
//
// The rule that matters most here is which SHIFT each post is found on. An
// emergency never reads the morning roster — that is deliberate, and is why a
// critical case on 3 September was shown a team that could not have been rung.
// A post that offers a shift the resolver ignores would reproduce that bug
// with nurses instead of anaesthetists, so the offering and the resolving are
// tested against each other.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  NURSING_POSTS, PERIOPERATIVE_NURSE_ROLES, postByKey, postAllowsShift,
  coveringShifts, supervisorShifts, locationForTheatreName, dateOnly,
} from '../../src/lib/roster/theatreNursing';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const CHASE = 'src/app/api/emergency-booking/[id]/chase-assignment/route.ts';
const API = 'src/app/api/theatre-nursing/staffing/route.ts';
const FORM = 'src/components/TheatreNursingPosts.tsx';
const BAND = 'src/components/NurseSupervisorBand.tsx';
const SCHEDULE = 'src/app/dashboard/surgeries/page.tsx';
const STAFFING = 'src/app/dashboard/holding-area/staffing/page.tsx';

/** A local-time moment, because the shift rules read local hours. */
const at = (hour: number) => new Date(2026, 10, 7, hour, 0, 0);

describe('the catalogue of posts', () => {
  it('covers everything that was asked for', () => {
    const keys = NURSING_POSTS.map((p) => p.key);
    expect(keys).toEqual([
      'MAIN_SCRUB', 'MAIN_CIRCULATING', 'AE_SCRUB', 'AE_CIRCULATING', 'SUPERVISOR',
    ]);
  });

  it('gives every post a shift it can be staffed on', () => {
    NURSING_POSTS.forEach((p) => {
      expect(p.shifts.length).toBeGreaterThan(0);
      expect(p.why.length).toBeGreaterThan(20);
    });
  });

  it('never offers MORNING on a main-theatre emergency post', () => {
    // The trap this whole file exists to close: an emergency does not read the
    // morning roster, so a nurse named there would look staffed and be chased
    // by nobody.
    const main = NURSING_POSTS.filter((p) => p.location === 'MAIN_THEATRE' && p.key !== 'SUPERVISOR');
    expect(main.length).toBe(2);
    main.forEach((p) => expect(p.shifts).not.toContain('MORNING'));
  });

  it('offers the A/E theatre the morning and night shifts it is run on', () => {
    const ae = NURSING_POSTS.filter((p) => p.location === 'A_AND_E');
    expect(ae.length).toBe(2);
    ae.forEach((p) => expect([...p.shifts].sort()).toEqual(['MORNING', 'NIGHT']));
  });

  it('lets a supervisor be named on any shift of the floor', () => {
    const sup = postByKey('SUPERVISOR');
    expect(sup?.subRole).toBe('SUPERVISING');
    expect([...(sup?.shifts ?? [])].sort()).toEqual(['CALL', 'MORNING', 'NIGHT']);
  });

  it('refuses a shift the post does not hold, and accepts the ones it does', () => {
    expect(postAllowsShift('MAIN_SCRUB', 'MORNING')).toBe(false);
    expect(postAllowsShift('MAIN_SCRUB', 'CALL')).toBe(true);
    expect(postAllowsShift('AE_SCRUB', 'MORNING')).toBe(true);
    expect(postAllowsShift('AE_SCRUB', 'CALL')).toBe(false);
    expect(postAllowsShift('NOT_A_POST', 'CALL')).toBe(false);
  });

  it('names only roles that exist, so a post is not held by a ghost', () => {
    // CIRCULATING_NURSE and NURSE_MANAGER are used elsewhere in this codebase
    // and are not in the enum; a findMany on them matches nobody while the
    // screen reports success.
    const schema = read('prisma/schema.prisma');
    const block = /enum UserRole \{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
    const known = new Set(block.split('\n').map((l) => l.trim()).filter(Boolean));
    PERIOPERATIVE_NURSE_ROLES.forEach((r) => expect(known.has(r)).toBe(true));
  });
});

describe('which shift answers an emergency', () => {
  it('reads day call for a main-theatre emergency in the daytime', () => {
    expect(coveringShifts('MAIN_THEATRE', at(10))).toEqual(['CALL']);
    expect(coveringShifts('MAIN_THEATRE', at(17))).toEqual(['CALL']);
  });

  it('reads night for a main-theatre emergency outside those hours', () => {
    expect(coveringShifts('MAIN_THEATRE', at(2))).toEqual(['NIGHT']);
    expect(coveringShifts('MAIN_THEATRE', at(19))).toEqual(['NIGHT']);
    expect(coveringShifts('MAIN_THEATRE', at(7))).toEqual(['NIGHT']);
  });

  it('NEVER reads the morning roster for the main theatre', () => {
    for (let h = 0; h < 24; h += 1) {
      expect(coveringShifts('MAIN_THEATRE', at(h))).not.toContain('MORNING');
    }
  });

  it('DOES read the morning roster for A/E, because that is how A/E is run', () => {
    // The A/E theatre's daytime cover is its morning team. Without this, an
    // A/E nurse recorded exactly as instructed would never be found.
    expect(coveringShifts('A_AND_E', at(10))).toContain('MORNING');
    expect(coveringShifts('A_AND_E', at(10))).toContain('CALL');
    expect(coveringShifts('A_AND_E', at(23))).toEqual(['NIGHT']);
  });

  it('is never empty, at any hour, for either location', () => {
    for (let h = 0; h < 24; h += 1) {
      expect(coveringShifts('MAIN_THEATRE', at(h)).length).toBeGreaterThan(0);
      expect(coveringShifts('A_AND_E', at(h)).length).toBeGreaterThan(0);
    }
  });
});

describe('which shift a nurse supervisor is found on', () => {
  it('finds the morning supervisor at ten in the morning', () => {
    // Not the emergency rule. A supervisor supervises the FLOOR, and the
    // person on the floor at 10:00 is the one rostered MORNING. Resolving
    // them on the emergency rule would report the floor unsupervised while
    // somebody was standing on it.
    expect(supervisorShifts(at(10))).toContain('MORNING');
  });

  it('reads both words for the hour, so either way of recording is found', () => {
    expect([...supervisorShifts(at(10))].sort()).toEqual(['CALL', 'MORNING']);
    expect([...supervisorShifts(at(19))].sort()).toEqual(['CALL', 'NIGHT']);
  });

  it('collapses to one shift when both rules agree', () => {
    expect(supervisorShifts(at(17))).toEqual(['CALL']);
    expect(supervisorShifts(at(23))).toEqual(['NIGHT']);
  });

  it('differs from the emergency rule during the morning, which is the point', () => {
    expect(supervisorShifts(at(9))).not.toEqual(coveringShifts('MAIN_THEATRE', at(9)));
  });
});

describe('which theatre a case belongs to', () => {
  it('recognises the A/E suites that are actually on file', () => {
    ['A&E Theatre', 'A&E North Wing Suite', 'A&E South Wing Suite']
      .forEach((n) => expect(locationForTheatreName(n)).toBe('A_AND_E'));
  });

  it('recognises the other spellings people use', () => {
    expect(locationForTheatreName('A/E theatre')).toBe('A_AND_E');
    expect(locationForTheatreName('Accident & Emergency')).toBe('A_AND_E');
    expect(locationForTheatreName('a & e theatre')).toBe('A_AND_E');
  });

  it('treats everything else, and nothing at all, as the main theatre', () => {
    // An unassigned emergency has no theatre name -- that is the case being
    // chased. Defaulting the other way would chase two A/E nurses about a
    // case in Theatre 3.
    ['Theatre 1', 'Theatre 5', 'Suite 2', 'CTU TH1', 'Eye Theatre', '', null, undefined]
      .forEach((n) => expect(locationForTheatreName(n)).toBe('MAIN_THEATRE'));
  });

  it('does not match a theatre that merely contains those letters', () => {
    expect(locationForTheatreName('Theatre 3')).toBe('MAIN_THEATRE');
    expect(locationForTheatreName('Cardiothoracic')).toBe('MAIN_THEATRE');
  });
});

describe('dateOnly', () => {
  it('strips the time, because Roster.date is a @db.Date', () => {
    const d = dateOnly(new Date(2026, 10, 7, 23, 45));
    expect(d.toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });
});

describe('the emergency chase is wired to these posts', () => {
  const src = () => read(CHASE);

  it('resolves the nurses through the nursing resolver, not the general one', () => {
    const s = src();
    expect(s).toContain("from '@/lib/roster/theatreNursing'");
    expect(s).toContain('await resolveEmergencyNursing({');
    // Resolved AND used. Calling the resolver and then messaging somebody
    // else is the failure this pair of assertions exists to catch.
    expect(s).toContain('add(nursing?.scrub ?? null,');
    expect(s).toContain('add(nursing?.circulating ?? null,');
  });

  it('asks for the right theatre, so an A/E case does not chase main theatre', () => {
    expect(src()).toContain('location: locationForTheatreName(booking.theatreName),');
  });

  it('still chases the supervisors alongside the theatre manager', () => {
    const s = src();
    expect(s).toContain("`Nurse Supervisor (${s.shift.toLowerCase()})`");
    const manager = s.indexOf("'Theatre Manager on duty'");
    const supervisor = s.indexOf('Nurse Supervisor (');
    expect(manager).toBeGreaterThan(-1);
    expect(supervisor).toBeGreaterThan(-1);
  });

  it('falls back to the on-duty board when a post is empty', () => {
    // A day nobody staffed the screen must still reach a nurse rather than
    // nobody at all.
    const s = src();
    expect(s).toContain('if (!nursing?.scrub) add(fromStaff(team?.scrubNurse)');
    expect(s).toContain('if (!nursing?.circulating) {');
  });

  it('is still asked by date and never by theatre id', () => {
    // An emergency with no theatre is the case being chased; a room-scoped
    // question returns nobody precisely when it matters.
    expect(read('src/lib/roster/theatreNursing.ts')).not.toContain('theatreId: opts');
  });
});

describe('the staffing endpoint', () => {
  const src = () => read(API);

  it('refuses a shift the post cannot be found on', () => {
    const s = src();
    expect(s).toContain('if (!postAllowsShift(post.key, shift)) {');
    expect(s).toContain("code: 'SHIFT_NOT_ON_THIS_POST'");
  });

  it('refuses anybody who is not a perioperative nurse', () => {
    const s = src();
    expect(s).toContain('PERIOPERATIVE_NURSE_ROLES as readonly string[]).includes(user.role)');
    expect(s).toContain("code: 'NOT_A_PERIOPERATIVE_NURSE'");
  });

  it('refuses an account that has not been approved', () => {
    expect(src()).toContain("user.status !== 'APPROVED'");
  });

  it('writes a roster row the rest of the application already reads', () => {
    // This is what makes the theatre meal count and duty performance pick the
    // person up without either of them being changed: both read rosters, and
    // duty performance keys off staffCategory.
    const s = src();
    expect(s).toContain("staffCategory: 'NURSES'");
    expect(s).toContain("status: 'PUBLISHED'");
    expect(s).toContain('theatreId: null');
  });

  it('refuses to write the same person onto the same post twice', () => {
    expect(src()).toContain("code: 'ALREADY_ALLOCATED'");
  });

  it('cannot be used to delete other people’s roster rows', () => {
    expect(src()).toContain("subRole: { in: ['SCRUB', 'CIRCULATING', 'SUPERVISING'] }");
  });

  it('records who put each person on a post, and who took them off', () => {
    const s = src();
    expect(s).toContain("action: 'THEATRE_NURSING_POST_ALLOCATED'");
    expect(s).toContain("action: 'THEATRE_NURSING_POST_REMOVED'");
  });
});

describe('the screens', () => {
  it('offers only the shifts the server says the post has', () => {
    // Retyping the shift list here is how the screen and the resolver drift
    // apart, and the drift is invisible until a chase reaches nobody.
    const s = read(FORM);
    expect(s).toContain('{(current?.shifts ?? []).map((s) => (');
    expect(s).not.toContain("shifts: ['CALL', 'NIGHT']");
  });

  it('keeps the chosen shift inside the chosen post', () => {
    expect(read(FORM)).toContain('if (current && !current.shifts.includes(shift)) setShift(current.shifts[0]);');
  });

  it('says what an empty post costs, rather than drawing an empty list', () => {
    expect(read(FORM)).toContain('a chase for this post will reach nobody.');
  });

  it('is reachable from the theatre staffing screen', () => {
    const s = read(STAFFING);
    expect(s).toContain("import TheatreNursingPosts from '@/components/TheatreNursingPosts';");
    expect(s).toContain('<TheatreNursingPosts date={date} canAllocate={canAllocate} />');
  });

  it('puts the supervisors on the surgery schedule for the day being viewed', () => {
    const s = read(SCHEDULE);
    expect(s).toContain("import NurseSupervisorBand from '@/components/NurseSupervisorBand';");
    expect(s).toContain('<NurseSupervisorBand date={dateFilter} />');
  });

  it('shows a number to ring, not just a name', () => {
    const s = read(BAND);
    expect(s).toContain('href={`tel:${s.phoneNumber}`}');
    expect(s).toContain('(no phone on file)');
  });

  it('says plainly when no supervisor is named', () => {
    expect(read(BAND)).toContain('No nurse supervisor is named for this day');
  });

  it('never breaks the schedule when the band cannot load', () => {
    // The schedule is the point of that page. A failed fetch shows "not
    // named", not an error and not a blank page.
    const s = read(BAND);
    expect(s).toContain('setRows([]);');
    expect(s).toMatch(/catch \{[\s\S]{0,400}setRows\(\[\]\);/);
  });
});
