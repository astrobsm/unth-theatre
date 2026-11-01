// ============================================================
// What a colleague is actually wished
// ------------------------------------------------------------
// THESE MESSAGES ASK FOR NOTHING. Not a review, not a figure, not an entry on
// the ORM. The moment a greeting carries a reminder it stops being a greeting
// and becomes a duty chase with a ribbon on it, and the person reading it
// learns that the hospital only writes when it wants something. The duty
// letters live in src/lib/dutyPerformance and are sent from a different screen
// by design — nothing from this file may ever mention them.
//
// AND THEY NAME THE WORK. "Thank you for your service" could be addressed to
// anybody; the cleaner who scrubbed the floor at 4am so the first case could
// start, the storekeeper who found the right size at the second attempt and
// the laboratory scientist who ran a cross-match at midnight all did
// something specific, and a message that can say what it was is the only kind
// worth sending. That is what contributionFor() is for, and it is the reason
// every role in the enum has a line rather than a fallback.
//
// NOBODY IS SENT ONE AUTOMATICALLY. Every message here is composed, shown on
// the celebrations screen, and sent by a person in theatre management.
// ============================================================

import { monthName, parseDay, type Occasion } from './calendar';

/** The hospital's own signature, in one place. */
const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

/**
 * The day written the way somebody says it: "1 November 2026".
 */
export function longDay(day: string): string {
  const p = parseDay(day);
  if (!p) return day;
  return `${p.day} ${monthName(p.month)} ${p.year}`;
}

/**
 * What this colleague actually does, in one or two sentences.
 *
 * Written in the second person and about the work, not the job title. Every
 * role in the UserRole enum is covered on purpose: a greeting that falls back
 * to "your contribution to the theatre" is the greeting the cleaners and the
 * porters would have received, and they are the two groups most used to being
 * thanked in the abstract.
 */
export function contributionFor(role: string | null | undefined): string {
  switch ((role ?? '').toUpperCase()) {
    // ── Surgery ────────────────────────────────────────────────────────
    case 'SURGEON':
    case 'CONSULTANT_SURGEON':
    case 'HEAD_OF_SURGERY':
    case 'HEAD_OF_OBSTETRICS_GYNAECOLOGY':
      return 'Families hand you the person they love most and ask you to give them '
        + 'back. You carry that, often for hours at a stretch, and then go and do it '
        + 'again on the next list.';
    case 'HOUSE_OFFICER':
      return 'You are the first to arrive and usually the last to leave, you know '
        + 'every patient on the list by name, and much of what runs smoothly in this '
        + 'theatre runs smoothly because you chased it.';

    // ── Anaesthesia ────────────────────────────────────────────────────
    case 'ANAESTHETIST':
    case 'CONSULTANT_ANAESTHETIST':
    case 'HEAD_OF_ANAESTHESIA':
      return 'You hold a patient between sleep and waking and bring them safely back '
        + 'across. Nobody outside this theatre understands how much vigilance that '
        + 'takes, and the measure of your work is all the things that never happened.';
    case 'ANAESTHETIC_TECHNICIAN':
      return 'The machine checked, the airway trolley stocked, the suction working — '
        + 'you are the reason an emergency induction at 2am finds everything where it '
        + 'should be.';

    // ── Nursing ────────────────────────────────────────────────────────
    case 'SCRUB_NURSE':
      return 'You know the instrument before it is asked for, you count every swab, '
        + 'and your care of the sterile field is the quiet reason patients go home '
        + 'without an infection.';
    case 'RECOVERY_ROOM_NURSE':
      return 'A patient opening their eyes in a strange room finds you already '
        + 'watching them. They may never learn your name; they remember being cared '
        + 'for.';
    case 'INFECTION_CONTROL_NURSE':
      return 'The infections that never happen leave no record, so your best work is '
        + 'invisible by definition. We know what it costs to insist, every day, on '
        + 'standards other people find inconvenient.';

    // ── Pharmacy and supply ────────────────────────────────────────────
    case 'PHARMACIST':
    case 'HEAD_OF_PHARMACY':
      return 'The right drug, the right dose, ready before the list starts — and the '
        + 'errors you intercept before anybody else sees them. A theatre with a '
        + 'pharmacist who is paying attention is a safer theatre, full stop.';
    case 'THEATRE_STORE_KEEPER':
      return 'You find the right size at short notice, you know what is on the shelf '
        + 'without looking, and a case that is not delayed for a missing item is not '
        + 'delayed because of you.';
    case 'PROCUREMENT_OFFICER':
      return 'Everything in this theatre arrived because somebody pursued it. That '
        + 'patience, with suppliers and with paperwork, is what keeps the lists '
        + 'running.';
    case 'CONSUMABLE_PACK_PROVIDER':
    case 'SCRUB_CARE_PROVIDER':
      return 'The packs arrive complete and on time, and a theatre that can rely on '
        + 'that can plan. Thank you for being dependable.';

    // ── Sterilisation, laundry, catering ───────────────────────────────
    case 'CSSD_SUPERVISOR':
    case 'CSSD_STAFF':
      return 'Every instrument that touches a patient passed through your hands '
        + 'first. The whole operating theatre rests on that work being done properly, '
        + 'every single time.';
    case 'LAUNDRY_SUPERVISOR':
    case 'LAUNDRY_STAFF':
      return 'Clean linen is one of those things a theatre only notices when it is '
        + 'missing. It is never missing, and that is your doing.';
    case 'THEATRE_CAFETERIA_MANAGER':
      return 'Staff come off a long list able to eat, and that is not a small '
        + 'kindness in a place where people routinely forget to. Thank you for '
        + 'looking after the people who look after the patients.';

    // ── Cleaning and movement ──────────────────────────────────────────
    case 'CLEANER':
      return 'A theatre is only safe to open because somebody cleaned it, and you '
        + 'clean it again between every case, often before the rest of us arrive. '
        + 'Nothing in this building happens without that.';
    case 'PORTER':
      return 'You move frightened people gently and you move them quickly when it '
        + 'matters. For many patients the first kind face in this theatre complex is '
        + 'yours.';

    // ── Engineering and utilities ──────────────────────────────────────
    case 'BIOMEDICAL_ENGINEER':
    case 'BIOMEDICAL_TECHNICIAN':
      return 'The monitors, the machines and the ventilators work because you keep '
        + 'them working — frequently at short notice, frequently in the middle of a '
        + 'case.';
    case 'POWER_PLANT_OPERATOR':
    case 'ELECTRICAL_TECHNICIAN':
      return 'A theatre that never loses power in the middle of an operation is not '
        + 'luck. It is somebody watching the plant through the night so that it '
        + 'never becomes a story.';
    case 'WORKS_SUPERVISOR':
      return 'The building keeps working because you keep it working, usually while '
        + 'everyone else is using it.';
    case 'PLUMBER':
    case 'PLUMBING_SUPERVISOR':
    case 'WATER_SUPPLY_SUPERVISOR':
      return 'No surgeon scrubs without running water. You keep it running, and it '
        + 'is one of the few things in this hospital that absolutely cannot wait.';
    case 'OXYGEN_UNIT_SUPERVISOR':
      return 'Oxygen is the one supply in this theatre that has no substitute and no '
        + 'grace period. Keeping it flowing is as close to life-saving as work gets.';

    // ── Diagnostics ────────────────────────────────────────────────────
    case 'EMERGENCY_LAB_SCIENTIST':
    case 'LABORATORY_STAFF':
    case 'HAEMATOLOGY_SCIENTIST':
    case 'CHEMICAL_PATHOLOGY_SCIENTIST':
    case 'MICROBIOLOGY_SCIENTIST':
    case 'LABORATORY_TECHNICIAN':
      return 'Decisions in this theatre are made on your results, often urgently and '
        + 'often at night. The accuracy you insist on is somebody else’s safe '
        + 'operation.';
    case 'RADIOLOGIST':
    case 'RADIOGRAPHER':
      return 'You show the surgeons what they cannot see, and a great many operations '
        + 'are safer for the picture you produced before the first incision.';
    case 'BLOODBANK_STAFF':
      return 'When a patient is bleeding, everything depends on how quickly and how '
        + 'carefully your unit answers. You have answered a great many times.';

    // ── Administration and leadership ──────────────────────────────────
    case 'BOOKING_OFFICER':
      return 'An orderly list is the difference between a theatre that runs and a '
        + 'theatre that argues, and the orderliness is yours.';
    case 'THEATRE_MANAGER':
    case 'THEATRE_CHAIRMAN':
    case 'CHIEF_MEDICAL_DIRECTOR':
    case 'CMAC':
    case 'DC_MAC':
      return 'Carrying responsibility for other people’s working conditions is '
        + 'tiring in a way that rarely shows, and the theatre runs on decisions you '
        + 'took without an audience.';
    case 'ADMIN':
    case 'SYSTEM_ADMINISTRATOR':
      return 'You keep the systems this theatre now depends on standing up, and you '
        + 'hear about it mainly when something breaks.';

    default:
      return 'Whatever the rest of us were doing in theatre, it depended on somebody '
        + 'doing your part of it properly. Thank you for doing it.';
  }
}

/** The occasion's own words: how it opens, and what we wish them. */
interface Words {
  opening: string;
  wish: string;
}

function wordsFor(o: Occasion): Words {
  const p = parseDay(o.date);
  const month = p ? monthName(p.month) : '';
  const year = p ? p.year : '';

  switch (o.key) {
    case 'new-month':
      return {
        opening: `Happy new month. A new month in a theatre complex is not a small `
          + `thing — it means another month of lists kept, emergencies answered and `
          + `patients sent home, and you were part of all of it.`,
        wish: `May ${month} be kind to you and to your family, and may the work it `
          + `brings find you well and strong.`,
      };
    case 'new-year':
      return {
        opening: `Happy New Year. A year has closed on a great deal of work — lists `
          + `that started on time because somebody came in early, nights nobody will ever `
          + `hear about, patients who went home to their families and have no idea how `
          + `many hands were involved.`,
        wish: `May ${year} bring you health, peace and the strength for the work ahead, `
          + `and may it be a year of good news for you and your household.`,
      };
    case 'christmas':
      return {
        opening: `A very happy Christmas to you and your family. Spare a thought for `
          + `what this season means in a theatre: while much of the country rests, this `
          + `complex stays open, and it stays open because people like you agree to be `
          + `here.`,
        wish: `May your Christmas be peaceful, may your home be full, and if you are on `
          + `duty over the holiday — thank you, sincerely. The patient who needs a `
          + `theatre on Christmas Day will never know your name, and will owe you a great `
          + `deal.`,
      };
    case 'boxing-day':
      return {
        opening: `Compliments of the season. We hope Christmas found you with the people `
          + `you love, and that today is a quieter one.`,
        wish: `Rest well where you can, and our thanks again to everyone covering the `
          + `theatre through the holiday.`,
      };
    case 'good-friday':
      return {
        opening: `A blessed Good Friday to you. It is a day about sacrifice, which is a `
          + `word this theatre understands better than most places — you give up `
          + `evenings, weekends and sleep so that other people can be made well.`,
        wish: `May the season bring you peace and renewal, and rest where the roster `
          + `allows it.`,
      };
    case 'easter':
      return {
        opening: `Happy Easter. A season of new life is a fitting one for people whose `
          + `work is giving it back.`,
        wish: `May this Easter bring you joy, good health and time with your family.`,
      };
    case 'workers-day':
      return {
        opening: `Happy Workers’ Day. Today honours work, and few places make the `
          + `meaning of that word as plain as an operating theatre does — long hours, `
          + `physical effort, unsocial shifts, and a standard that cannot be allowed to `
          + `slip because somebody is tired.`,
        wish: `Our respect and our thanks, today especially. We hope you can rest.`,
      };
    case 'democracy-day':
      return {
        opening: `Happy Democracy Day. A nation is judged, in the end, by how it treats `
          + `people at their most vulnerable — and that treatment happens in rooms `
          + `like ours, in the hands of people like you.`,
        wish: `A peaceful and restful holiday to you and your family.`,
      };
    case 'independence-day':
      return {
        opening: `Happy Independence Day. On a day of national thanksgiving it is worth `
          + `saying plainly: the service you give in this theatre is service to Nigeria. `
          + `Every patient who leaves here able to return to their work and their family `
          + `is part of what this country is.`,
        wish: `A proud and peaceful Independence Day to you and your household. Thank you `
          + `for the part you play in the care this nation gives its people.`,
      };
    case 'world-health-day':
      return {
        opening: `A happy World Health Day to you. The theme of the day is always the `
          + `same underneath: health is built by people, one patient at a time, usually `
          + `without recognition.`,
        wish: `Thank you for building it here. May your own health be well looked after `
          + `too.`,
      };
    case 'patient-safety-day':
      return {
        opening: `Today is World Patient Safety Day, and it belongs to you more than to `
          + `anybody who will make a speech about it. Patient safety in this theatre is `
          + `not a policy document — it is a count that was done properly, a check `
          + `that was not skipped, a concern that somebody was brave enough to raise.`,
        wish: `Thank you for the care you take. Please keep speaking up; it is the single `
          + `most valuable thing anybody in this complex does.`,
      };
    case 'nurses-day':
      return {
        opening: `Happy International Nurses Day. There is no operating theatre anywhere `
          + `in the world without nurses, and everybody who has ever worked in one knows `
          + `it — the care, the counting, the watching, the advocacy for a patient who `
          + `cannot speak for themselves.`,
        wish: `Today is yours. Thank you for the standard you hold, and for the kindness `
          + `you show patients at the most frightening moment of their lives.`,
      };
    case 'pharmacists-day':
      return {
        opening: `Happy World Pharmacists Day. Safe anaesthesia and safe surgery rest on `
          + `the right drug being in the right place at the right strength, and on `
          + `somebody who knows the difference catching it when it is not.`,
        wish: `Today is yours. Thank you for the errors nobody ever heard about because `
          + `you stopped them.`,
      };
    case 'anaesthesia-day':
      return {
        opening: `Happy World Anaesthesia Day. Today marks the first public demonstration `
          + `of surgical anaesthesia — the moment surgery stopped being something `
          + `endured and became something survived. Everything this complex does rests on `
          + `it.`,
        wish: `Today is yours. Thank you for the vigilance that keeps patients safe `
          + `through the hours they will never remember.`,
      };
    case 'radiology-day':
      return {
        opening: `Happy International Day of Radiology. Surgeons operate on what you `
          + `showed them, and a great many operations were made safer, shorter or `
          + `unnecessary by a picture taken in good time.`,
        wish: `Today is yours, with our thanks.`,
      };
    case 'lab-science-day':
      return {
        opening: `Happy International Medical Laboratory Science Day. The clinical world `
          + `makes its decisions on your numbers, usually without ever meeting you.`,
        wish: `Today is yours. Thank you for the rigour — at midnight as much as at `
          + `midday.`,
      };
    default:
      return {
        opening: `${o.title} — our warm greetings to you and your family on this `
          + `occasion.`,
        wish: `May the day bring you rest, joy and good health.`,
      };
  }
}

/**
 * The message for a calendar occasion, addressed to one person.
 *
 * Individually addressed, deliberately. A single broadcast to two hundred
 * people reads as a circular; the same words with a colleague's name and their
 * own work in them reads as a letter, and that is the entire point of this
 * feature.
 */
export function buildCelebrationMessage(input: {
  occasion: Occasion;
  personName: string;
  role?: string | null;
  /** Words from theatre management, added on the screen. Optional. */
  note?: string | null;
}): string {
  const w = wordsFor(input.occasion);
  const lines: string[] = [
    `UNTH Theatre — ${input.occasion.title}`,
    longDay(input.occasion.date),
    '',
    `Dear ${input.personName},`,
    '',
    w.opening,
    '',
    contributionFor(input.role),
    '',
    w.wish,
  ];

  if (input.note && input.note.trim()) {
    lines.push('', input.note.trim());
  }

  lines.push('', 'With gratitude and respect,', SIGN_OFF);
  return lines.join('\n');
}

export type PersonalKind = 'BIRTHDAY' | 'WEDDING_ANNIVERSARY' | 'WORK_ANNIVERSARY' | 'OTHER';

/** How many years, where the person gave us a starting year. */
function yearsIn(sinceYear: number | null | undefined, onYear: number): number | null {
  if (!sinceYear || sinceYear < 1900 || sinceYear > onYear) return null;
  const years = onYear - sinceYear;
  return years > 0 ? years : null;
}

/**
 * The message for a day this colleague told us about.
 *
 * A birthday greeting from an employer is a small thing that people remember
 * for a surprisingly long time, and the reason it works is that it is clearly
 * not automatic — it names the person, it names what they do, and it asks for
 * nothing at all.
 */
export function buildPersonalCelebrationMessage(input: {
  kind: PersonalKind;
  /** What the person called it, for OTHER. */
  label?: string | null;
  /** The day it falls on this year, YYYY-MM-DD. */
  date: string;
  personName: string;
  role?: string | null;
  sinceYear?: number | null;
  note?: string | null;
}): string {
  const p = parseDay(input.date);
  const years = yearsIn(input.sinceYear, p ? p.year : 0);
  const title = personalTitle(input.kind, input.label);

  let opening: string;
  let wish: string;

  switch (input.kind) {
    case 'BIRTHDAY':
      opening = 'Happy birthday. We hope the day finds you surrounded by the people '
        + 'who love you, and that somebody else is doing the cooking.';
      wish = 'Many happy returns, long life and good health. Enjoy your day — you '
        + 'have earned it.';
      break;
    case 'WEDDING_ANNIVERSARY':
      opening = years
        ? `Happy wedding anniversary — ${years} ${years === 1 ? 'year' : 'years'} `
          + `today. Anyone who has worked a theatre roster knows what a marriage puts up `
          + `with: the late finishes, the calls at night, the plans changed at an hour’s `
          + `notice.`
        : 'Happy wedding anniversary. Anyone who has worked a theatre roster knows what '
          + 'a marriage puts up with: the late finishes, the calls at night, the plans '
          + 'changed at an hour’s notice.';
      wish = 'Our congratulations to you both, and our thanks to your family for the '
        + 'share of you that this hospital takes. May there be many more.';
      break;
    case 'WORK_ANNIVERSARY':
      opening = years
        ? `${years} ${years === 1 ? 'year' : 'years'} of service today. That is `
          + `${years === 1 ? 'a year' : `${years} years`} of lists, nights, emergencies and `
          + `patients — a great deal of it at personal cost, and most of it never `
          + `remarked upon.`
        : 'Congratulations on your work anniversary. Years of lists, nights, '
          + 'emergencies and patients — a great deal of it at personal cost, and most '
          + 'of it never remarked upon.';
      wish = 'Thank you for staying, and for the standard you have held while you have '
        + 'been here. This theatre is better for it.';
      break;
    default:
      opening = `${title} — you asked us to remember this day, and we are glad to.`;
      wish = 'We hope it is everything you wanted it to be.';
      break;
  }

  const lines: string[] = [
    `UNTH Theatre — ${title}`,
    longDay(input.date),
    '',
    `Dear ${input.personName},`,
    '',
    opening,
    '',
    contributionFor(input.role),
    '',
    wish,
  ];

  if (input.note && input.note.trim()) {
    lines.push('', input.note.trim());
  }

  lines.push('', 'With warm regards,', SIGN_OFF);
  return lines.join('\n');
}

/** What a personal day is called in a heading and a message. */
export function personalTitle(kind: PersonalKind, label?: string | null): string {
  switch (kind) {
    case 'BIRTHDAY': return 'Happy Birthday';
    case 'WEDDING_ANNIVERSARY': return 'Wedding Anniversary';
    case 'WORK_ANNIVERSARY': return 'Work Anniversary';
    default: return (label ?? '').trim() || 'A Special Day';
  }
}
