import { describe, it, expect } from 'vitest';
import {
  occasionsOn, occasionsBetween, easterDays, easterSunday, watToday, parseDay,
  monthName, occasionReachesRole, pairsFor, NURSING_ROLES, PHARMACY_ROLES,
} from '../../src/lib/celebrations/calendar';
import {
  buildCelebrationMessage, buildPersonalCelebrationMessage, contributionFor,
  personalTitle, longDay,
} from '../../src/lib/celebrations/messages';

// These messages are the hospital being kind to its own staff, and the ways
// they can be wrong are specific:
//
//   a greeting that carries a duty reminder is not a greeting;
//   a professional day sent to the wrong cadre proves nobody checked;
//   a birthday greeting that quotes somebody's age was not asked for;
//   and "thank you for your service" with no idea what the service was is the
//   message the cleaners and the porters have had all their working lives.
//
// Each of those has a test below, because each of them would be sent to
// hundreds of people before anybody could stop it.

const ALL = (over: Partial<Parameters<typeof buildCelebrationMessage>[0]['occasion']> = {}) => ({
  key: 'new-month',
  kind: 'NEW_MONTH' as const,
  title: 'Happy New Month — November',
  date: '2026-11-01',
  audience: 'ALL' as const,
  ...over,
});

describe('the calendar', () => {
  it('puts the new-month greeting on the first, and nowhere else', () => {
    expect(occasionsOn('2026-11-01').some((o) => o.key === 'new-month')).toBe(true);
    expect(occasionsOn('2026-11-02').some((o) => o.key === 'new-month')).toBe(false);
  });

  it('knows the national days', () => {
    const keys = (d: string) => occasionsOn(d).map((o) => o.key);
    expect(keys('2026-10-01')).toContain('independence-day');
    expect(keys('2026-12-25')).toContain('christmas');
    expect(keys('2026-01-01')).toContain('new-year');
    expect(keys('2026-05-01')).toContain('workers-day');
    expect(keys('2026-06-12')).toContain('democracy-day');
  });

  // The 1st of October is Independence Day AND the first of a month. Both are
  // offered, but the national day must be the one at the top: a colleague who
  // gets "happy new month" on Independence Day has been written to by a
  // machine and can tell.
  it('ranks the larger occasion above the monthly greeting', () => {
    const o = occasionsOn('2026-10-01');
    expect(o.length).toBeGreaterThan(1);
    expect(o[0].key).toBe('independence-day');
    expect(o[o.length - 1].key).toBe('new-month');
  });

  it('computes Easter rather than tabulating it', () => {
    // Known values: Easter Sunday 2026 is 5 April, 2027 is 28 March.
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
    expect(easterDays(2026)).toEqual({ goodFriday: '2026-04-03', easterMonday: '2026-04-06' });
    expect(occasionsOn('2026-04-03').map((o) => o.key)).toContain('good-friday');
    expect(occasionsOn('2026-04-06').map((o) => o.key)).toContain('easter');
  });

  it('scopes a professional day to its own cadre', () => {
    const nurses = occasionsOn('2026-05-12').find((o) => o.key === 'nurses-day')!;
    expect(nurses.audience).toBe('ROLES');
    expect(occasionReachesRole(nurses, 'SCRUB_NURSE')).toBe(true);
    expect(occasionReachesRole(nurses, 'RECOVERY_ROOM_NURSE')).toBe(true);
    // The failure that would embarrass the hospital: a pharmacist thanked for
    // being a nurse.
    expect(occasionReachesRole(nurses, 'PHARMACIST')).toBe(false);
    expect(occasionReachesRole(nurses, null)).toBe(false);

    const pharm = occasionsOn('2026-09-25').find((o) => o.key === 'pharmacists-day')!;
    PHARMACY_ROLES.forEach((r) => expect(occasionReachesRole(pharm, r)).toBe(true));
    NURSING_ROLES.forEach((r) => expect(occasionReachesRole(pharm, r)).toBe(false));
  });

  it('reaches everybody on an occasion with no roles', () => {
    const o = occasionsOn('2026-12-25')[0];
    expect(o.audience).toBe('ALL');
    expect(occasionReachesRole(o, 'CLEANER')).toBe(true);
    expect(occasionReachesRole(o, null)).toBe(true);
  });

  // Eid moves with the moon and is announced days ahead by the Federal
  // Government. Guessing it would send Muslim colleagues a greeting on the
  // wrong day, which is worse than sending none — it goes out through the
  // custom form instead, and this test is what stops somebody adding it to
  // the fixed table in good faith.
  it('does not guess at the Islamic festivals', () => {
    const everyDay: string[] = [];
    for (let m = 1; m <= 12; m += 1) {
      for (let d = 1; d <= 28; d += 1) {
        occasionsOn(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
          .forEach((o) => everyDay.push(o.key));
      }
    }
    expect(everyDay.join(' ')).not.toMatch(/eid|ramadan|sallah/i);
  });

  it('lists what is coming up, in order, inclusive of both ends', () => {
    const soon = occasionsBetween('2026-09-25', '2026-10-01');
    expect(soon.map((o) => o.key)).toContain('pharmacists-day');
    expect(soon.map((o) => o.key)).toContain('independence-day');
    const dates = soon.map((o) => o.date);
    expect(dates.slice().sort().join()).toBe(dates.join());
  });

  it('reads the date in Enugu, not in UTC', () => {
    // 23:30 UTC on 31 October is already 1 November in WAT, and that is the
    // hour the new-month greeting would otherwise go missing in.
    expect(watToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    expect(watToday(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-31');
  });

  it('refuses a date that is not one', () => {
    expect(parseDay('not-a-date')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(occasionsOn('2026-13-01')).toEqual([]);
    expect(monthName(11)).toBe('November');
  });
});

describe('a birthday on the 29th of February', () => {
  // Three years in four there is no 29th. Skipping those people is precisely
  // the kind of forgetting this feature exists to stop, so they are shown on
  // the 28th instead.
  it('shows them on the 28th in a year that has no 29th', () => {
    expect(pairsFor('2026-02-28')).toEqual([{ month: 2, day: 28 }, { month: 2, day: 29 }]);
    expect(pairsFor('2028-02-28')).toEqual([{ month: 2, day: 28 }]);
    expect(pairsFor('2028-02-29')).toEqual([{ month: 2, day: 29 }]);
  });

  it('leaves every other date alone', () => {
    expect(pairsFor('2026-11-01')).toEqual([{ month: 11, day: 1 }]);
    expect(pairsFor('rubbish')).toEqual([]);
  });

  it('counts a century year correctly', () => {
    // 2100 is not a leap year; 2000 was. The rule costs one line and is wrong
    // in a hand-rolled version about once a century.
    expect(pairsFor('2100-02-28')).toEqual([{ month: 2, day: 28 }, { month: 2, day: 29 }]);
    expect(pairsFor('2000-02-28')).toEqual([{ month: 2, day: 28 }]);
  });
});

describe('what a colleague is actually sent', () => {
  it('names the person and the occasion', () => {
    const msg = buildCelebrationMessage({
      occasion: ALL(),
      personName: 'Mrs Ada Okeke',
      role: 'SCRUB_NURSE',
    });
    expect(msg).toContain('Dear Mrs Ada Okeke,');
    expect(msg).toContain('Happy New Month — November');
    expect(msg).toContain('1 November 2026');
    expect(msg).toContain('Theatre Management, UNTH Ituku-Ozalla');
  });

  // The one rule this whole module exists to keep. A greeting that reminds you
  // about the ORM is a duty chase with a ribbon on it, and the person reading
  // it learns the hospital only writes when it wants something.
  it('asks for nothing at all', () => {
    const roles = ['SCRUB_NURSE', 'PHARMACIST', 'CLEANER', 'PORTER', 'CONSULTANT_ANAESTHETIST'];
    const days = ['2026-11-01', '2026-10-01', '2026-12-25', '2026-05-12'];
    days.forEach((date) => {
      occasionsOn(date).forEach((occasion) => {
        roles.forEach((role) => {
          const msg = buildCelebrationMessage({ occasion, personName: 'Dr A', role });
          expect(msg).not.toMatch(/ORM|record it|deadline|outstanding|duty roster|percentage/i);
          expect(msg).not.toMatch(/please ensure|failure to|we are asking you/i);
        });
      });
    });
  });

  // "Thank you for your service" could be addressed to anybody. Every role in
  // the enum gets a line about the work it actually does, and the two groups
  // most used to being thanked in the abstract are the ones checked here.
  it('says what the person actually does', () => {
    expect(contributionFor('CLEANER')).toMatch(/clean/i);
    expect(contributionFor('PORTER')).toMatch(/move/i);
    expect(contributionFor('SCRUB_NURSE')).toMatch(/instrument|swab|sterile/i);
    expect(contributionFor('PHARMACIST')).toMatch(/dose|drug/i);
    expect(contributionFor('CSSD_STAFF')).toMatch(/instrument/i);
    expect(contributionFor('POWER_PLANT_OPERATOR')).toMatch(/power|plant/i);
    expect(contributionFor('EMERGENCY_LAB_SCIENTIST')).toMatch(/result/i);
    // Every one of them is a real sentence, not a placeholder.
    ['CLEANER', 'PORTER', 'LAUNDRY_STAFF', 'PLUMBER', 'BIOMEDICAL_ENGINEER',
      'THEATRE_CAFETERIA_MANAGER', 'HOUSE_OFFICER', 'BOOKING_OFFICER'].forEach((r) => {
      expect(contributionFor(r).length).toBeGreaterThan(60);
    });
  });

  it('still has something to say to a role it has never heard of', () => {
    const msg = buildCelebrationMessage({
      occasion: ALL(), personName: 'Mr B', role: 'SOME_NEW_ROLE',
    });
    expect(msg).toContain('Thank you for doing it.');
    expect(msg.length).toBeGreaterThan(200);
  });

  it('carries a line written by theatre management', () => {
    const msg = buildCelebrationMessage({
      occasion: ALL(), personName: 'Mr B', role: 'PORTER',
      note: 'The complex closes at 2pm today.',
    });
    expect(msg).toContain('The complex closes at 2pm today.');
    // And after the wish, not in place of it.
    expect(msg.indexOf('The complex closes')).toBeGreaterThan(msg.indexOf('Dear Mr B'));
  });

  it('thanks the people who are on duty over Christmas', () => {
    const occasion = occasionsOn('2026-12-25').find((o) => o.key === 'christmas')!;
    const msg = buildCelebrationMessage({ occasion, personName: 'Mr C', role: 'ANAESTHETIC_TECHNICIAN' });
    expect(msg).toMatch(/on duty/i);
    expect(msg).toMatch(/thank you/i);
  });

  it('speaks of service to the nation on Independence Day', () => {
    const occasion = occasionsOn('2026-10-01').find((o) => o.key === 'independence-day')!;
    const msg = buildCelebrationMessage({ occasion, personName: 'Mrs D', role: 'RECOVERY_ROOM_NURSE' });
    expect(msg).toMatch(/Nigeria/);
    expect(msg).toMatch(/service/i);
  });
});

describe('a day the person told us about', () => {
  it('wishes a happy birthday without mentioning an age', () => {
    const msg = buildPersonalCelebrationMessage({
      kind: 'BIRTHDAY',
      date: '2026-07-14',
      personName: 'Mr Emeka Nwosu',
      role: 'PORTER',
      // Even if a year somehow arrives, a birthday must not count it: that
      // would publish somebody's age in a WhatsApp message.
      sinceYear: 1984,
    });
    expect(msg).toContain('Happy birthday');
    expect(msg).toContain('Dear Mr Emeka Nwosu,');
    // Word-bounded on purpose: "Theatre Management" contains "age".
    expect(msg).not.toMatch(/\b42\b|\b1984\b|years old|\bage\b|\baged\b/i);
  });

  it('counts the years on an anniversary, where the person gave one', () => {
    const msg = buildPersonalCelebrationMessage({
      kind: 'WORK_ANNIVERSARY',
      date: '2026-03-02',
      personName: 'Mrs F',
      role: 'SCRUB_NURSE',
      sinceYear: 2006,
    });
    expect(msg).toContain('20 years of service');
  });

  it('manages without a year', () => {
    const msg = buildPersonalCelebrationMessage({
      kind: 'WEDDING_ANNIVERSARY', date: '2026-03-02', personName: 'Mrs F', role: 'SCRUB_NURSE',
    });
    expect(msg).toContain('Happy wedding anniversary');
    expect(msg).not.toMatch(/NaN|undefined|null/);
  });

  it('ignores a starting year that makes no sense', () => {
    const msg = buildPersonalCelebrationMessage({
      kind: 'WORK_ANNIVERSARY', date: '2026-03-02', personName: 'Mrs F',
      role: 'SCRUB_NURSE', sinceYear: 2030,
    });
    expect(msg).not.toMatch(/-4 years|NaN/);
    expect(msg).toContain('Congratulations on your work anniversary');
  });

  it('calls a day of the person’s own by the name they gave it', () => {
    expect(personalTitle('OTHER', 'Ordination anniversary')).toBe('Ordination anniversary');
    expect(personalTitle('OTHER', '  ')).toBe('A Special Day');
    expect(personalTitle('BIRTHDAY')).toBe('Happy Birthday');
    const msg = buildPersonalCelebrationMessage({
      kind: 'OTHER', label: 'Ordination anniversary', date: '2026-08-09',
      personName: 'Rev Sr G', role: 'INFECTION_CONTROL_NURSE',
    });
    expect(msg).toContain('Ordination anniversary');
  });

  it('asks nothing of them either', () => {
    (['BIRTHDAY', 'WEDDING_ANNIVERSARY', 'WORK_ANNIVERSARY', 'OTHER'] as const).forEach((kind) => {
      const msg = buildPersonalCelebrationMessage({
        kind, label: 'A day', date: '2026-08-09', personName: 'Mr H', role: 'CLEANER',
        sinceYear: 2016,
      });
      expect(msg).not.toMatch(/ORM|deadline|outstanding|please ensure/i);
    });
  });

  it('writes the date the way somebody says it', () => {
    expect(longDay('2026-11-01')).toBe('1 November 2026');
    expect(longDay('nonsense')).toBe('nonsense');
  });

  // It goes out over WhatsApp, where a wall of text is not read.
  it('fits a message somebody will actually read', () => {
    const msg = buildCelebrationMessage({
      occasion: ALL(), personName: 'Mrs Ada Okeke', role: 'SCRUB_NURSE',
    });
    expect(msg.length).toBeLessThan(1400);
    expect(buildPersonalCelebrationMessage({
      kind: 'BIRTHDAY', date: '2026-07-14', personName: 'Mr I', role: 'PORTER',
    }).length).toBeLessThan(1200);
  });
});
