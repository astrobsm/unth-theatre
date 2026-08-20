/**
 * The 60-minute preoperative alert.
 *
 * Two things matter here and both are easy to get wrong in a way that only
 * shows up in production:
 *
 *   1. The window. A cron running every five minutes must alert each case
 *      exactly once, must not alert tomorrow's list today, and must not fire
 *      at a case that has already started or already passed its time.
 *   2. The radio text. It is spoken aloud in a public corridor, so what is
 *      NOT in it is as much a requirement as what is.
 */
import { describe, expect, it } from 'vitest';

import {
  ALERT_LEAD_MINUTES,
  alertAnnouncement,
  alertNotification,
  announcementOrder,
  announcementPriority,
  dueForAlert,
  minutesUntil,
  recipientsOf,
  theatrePhrase,
  wardReminder,
} from '../../src/lib/theatreOps/preopAlert';

const NOW = new Date('2026-08-03T08:00:00.000Z');
/** A time `m` minutes after NOW. */
const inMins = (m: number) => new Date(NOW.getTime() + m * 60_000);

const candidate = (over: Partial<Parameters<typeof dueForAlert>[0]> = {}) => ({
  scheduledStart: inMins(60),
  status: 'SCHEDULED',
  alreadyAlerted: false,
  started: false,
  ...over,
});

describe('the lead time is an hour', () => {
  it('is what the hospital asked for', () => {
    expect(ALERT_LEAD_MINUTES).toBe(60);
  });
});

describe('counting down to the scheduled time', () => {
  it('counts forward before the time', () => {
    expect(minutesUntil(inMins(45), NOW)).toBe(45);
  });

  it('goes negative after it', () => {
    expect(minutesUntil(inMins(-20), NOW)).toBe(-20);
  });

  it('has nothing to say about a booking with no readable time', () => {
    expect(minutesUntil(null, NOW)).toBe(null);
  });
});

describe('deciding whether a case is due for its alert', () => {
  it('fires at exactly sixty minutes', () => {
    const d = dueForAlert(candidate({ scheduledStart: inMins(60) }), NOW);
    expect(d.send).toBe(true);
    expect(d.minutesBefore).toBe(60);
  });

  it('does not fire at sixty-one', () => {
    expect(dueForAlert(candidate({ scheduledStart: inMins(61) }), NOW).send).toBe(false);
  });

  it('does not fire for tomorrow morning', () => {
    expect(dueForAlert(candidate({ scheduledStart: inMins(24 * 60) }), NOW).send).toBe(false);
  });

  it('fires for a case booked at short notice', () => {
    // Added to the list at 08:00 for 08:25. The team is told as soon as the
    // system knows, not an hour before a time that has already gone.
    expect(dueForAlert(candidate({ scheduledStart: inMins(25) }), NOW).send).toBe(true);
  });

  it('goes quiet once the scheduled time passes', () => {
    // Being late is the delay detector's business. "Your case starts in -20
    // minutes" helps nobody.
    const d = dueForAlert(candidate({ scheduledStart: inMins(-20) }), NOW);
    expect(d.send).toBe(false);
    expect(d.reason).toContain('passed');
  });

  it('does not fire exactly on the scheduled minute', () => {
    expect(dueForAlert(candidate({ scheduledStart: inMins(0) }), NOW).send).toBe(false);
  });

  it('alerts each case once and only once', () => {
    // The cron runs every five minutes. Without this, a case due in an hour
    // would be announced twelve times before it started.
    expect(dueForAlert(candidate({ alreadyAlerted: true }), NOW).send).toBe(false);
  });

  it('says nothing about a cancelled case', () => {
    expect(dueForAlert(candidate({ status: 'CANCELLED' }), NOW).send).toBe(false);
  });

  it('says nothing about a case already under way', () => {
    // An early start is a good thing, not a reason to call for the patient.
    const d = dueForAlert(candidate({ started: true }), NOW);
    expect(d.send).toBe(false);
    expect(d.reason).toContain('under way');
  });

  it('says nothing about a booking with no readable time', () => {
    expect(dueForAlert(candidate({ scheduledStart: null }), NOW).send).toBe(false);
  });
});

describe('who gets told', () => {
  it('names each person once, however many jobs they hold', () => {
    const r = recipientsOf([
      { userId: 'u1', name: 'Prof Eze', role: 'Surgeon' },
      { userId: 'u1', name: 'Prof Eze', role: 'Supervising Consultant' },
      { userId: 'u2', name: 'Dr Adaeze', role: 'Anaesthetist' },
    ]);
    expect(r.length).toBe(2);
    expect(r[0].roles).toEqual(['Surgeon', 'Supervising Consultant']);
  });

  it('skips slots filled by a name but no account', () => {
    // A surgeon typed in as free text has nowhere to receive a notification.
    const r = recipientsOf([
      { userId: null, name: 'Dr Locum', role: 'Surgeon' },
      { userId: 'u2', name: 'Dr Adaeze', role: 'Anaesthetist' },
    ]);
    expect(r.map((x) => x.userId)).toEqual(['u2']);
  });

  it('returns nobody for an unassigned case rather than failing', () => {
    expect(recipientsOf([]).length).toBe(0);
  });
});

const subject = {
  patientName: 'Mr John Okeke',
  hospitalNumber: 'UNTH/2026/44112',
  procedureName: 'exploratory laparotomy',
  theatre: 'Theatre Three',
  scheduledTime: '10:00',
  unit: 'General Surgery',
  ward: 'Male Surgical Ward',
  team: [{ role: 'Surgeon', name: 'Prof Eze' }],
  packs: ['Laparotomy set'],
  bloodRequired: true,
  bloodDetail: 'O+, 2 units',
  equipment: ['Diathermy'],
  specialInstructions: 'Patient is diabetic — first on the list.',
};

describe('the notification each person receives', () => {
  it('says how long they have, and where', () => {
    const n = alertNotification(subject, 60);
    expect(n.title).toContain('60 minutes');
    expect(n.title).toContain('Theatre Three');
  });

  it('carries the working detail — this one is private to the recipient', () => {
    const n = alertNotification(subject, 60);
    expect(n.message).toContain('UNTH/2026/44112');
    expect(n.message).toContain('Laparotomy set');
    expect(n.message).toContain('Blood required');
    expect(n.message).toContain('Diathermy');
    expect(n.message).toContain('diabetic');
  });

  it('leaves out what a case does not have, rather than saying "none"', () => {
    const n = alertNotification(
      { ...subject, packs: [], bloodRequired: false, equipment: [], specialInstructions: null },
      45
    );
    expect(n.message).not.toContain('Packs');
    expect(n.message).not.toContain('Blood');
    expect(n.message).not.toContain('Equipment');
  });
});

describe('the radio call', () => {
  it('reads as the hospital wrote it', () => {
    expect(alertAnnouncement(subject)).toBe(
      'Attention Theatre Three. Kindly send for Mr John Okeke, scheduled for exploratory laparotomy at 10:00 hours.'
    );
  });

  it('does NOT speak the hospital number aloud', () => {
    // The announcement plays over a corridor speaker. The number is what turns
    // a name overheard in passing into a retrievable record, and it adds
    // nothing to an instruction to send for a patient.
    expect(alertAnnouncement(subject)).not.toContain('UNTH/2026/44112');
  });

  it('still says something sensible when no theatre is allocated', () => {
    expect(alertAnnouncement({ ...subject, theatre: null })).toContain('Attention the theatre.');
  });

  it('handles a blank theatre name the same as a missing one', () => {
    expect(theatrePhrase('   ')).toBe('the theatre');
  });
});

describe('the ward reminder', () => {
  it('asks for the four things the ward has to do', () => {
    const w = wardReminder(subject, 60);
    expect(w.message).toContain('identity');
    expect(w.message).toContain('consent');
    expect(w.message).toContain('documentation');
    expect(w.message).toContain('transfer');
  });

  it('names the patient in the title so it is actionable from the lock screen', () => {
    expect(wardReminder(subject, 60).title).toContain('Mr John Okeke');
  });

  it('names the ward, because every ward nurse receives it', () => {
    // The push goes to a role, not to a ward. Without the ward in the title,
    // every ward nurse in the hospital reads every reminder to decide it was
    // not theirs — and stops reading them.
    expect(wardReminder(subject, 60).title).toContain('Male Surgical Ward');
  });

  it('still reads properly when the ward is unrecorded', () => {
    expect(wardReminder({ ...subject, ward: null }, 60).title).toContain('Mr John Okeke');
  });
});

describe('the announcement queue', () => {
  const c = (id: string, mins: number | null, isEmergency = false) => ({
    id,
    scheduledStart: mins === null ? null : inMins(mins),
    isEmergency,
  });

  it('calls the soonest case first', () => {
    const ordered = announcementOrder([c('b', 50), c('a', 10), c('c', 30)]);
    expect(ordered.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('puts an emergency ahead of an elective case due sooner', () => {
    const ordered = announcementOrder([c('elective', 10), c('emergency', 55, true)]);
    expect(ordered[0].id).toBe('emergency');
  });

  it('does not reorder the caller\'s array', () => {
    const input = [c('b', 50), c('a', 10)];
    announcementOrder(input);
    expect(input.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('sends a case with no time to the back rather than dropping it', () => {
    const ordered = announcementOrder([c('untimed', null), c('timed', 40)]);
    expect(ordered.map((x) => x.id)).toEqual(['timed', 'untimed']);
  });
});

describe('radio priority', () => {
  it('rises as the scheduled time approaches', () => {
    expect(announcementPriority(10, false)).toBeGreaterThan(announcementPriority(60, false));
  });

  it('never lets a routine call outrank an emergency', () => {
    // 100 is the emergency ceiling used by the radio queue. A preoperative
    // call must never reach it, or it would cancel the music AND sit above a
    // theatre asking for help.
    expect(announcementPriority(1, false)).toBeLessThan(announcementPriority(60, true));
    expect(announcementPriority(1, false)).toBeLessThan(95);
  });

  it('keeps an emergency at a fixed height regardless of its timing', () => {
    expect(announcementPriority(5, true)).toBe(announcementPriority(55, true));
  });
});
