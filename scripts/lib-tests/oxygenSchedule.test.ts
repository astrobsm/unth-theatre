/**
 * The oxygen posting schedule, and what theatre may say back.
 *
 * The rule as given: an update every morning, then every two hours until 2 pm,
 * on each working day. Everything here exists because a readiness report has
 * always been writable at any hour, so a board reading "Central supply: GOOD"
 * could not be told apart from one reading "GOOD, as of Tuesday" — and an
 * anaesthetic technician setting up at 11:40 needs the second.
 *
 * All dates below are constructed in LOCAL time on purpose. The oxygen room,
 * the theatre server and this machine are on WAT, and "the 10 o'clock update"
 * means ten o'clock in the oxygen room. A test written in UTC would pass here
 * and describe a different hospital.
 */
import { describe, expect, it } from 'vitest';
import {
  OXYGEN_UPDATE_SLOTS,
  OXYGEN_UPDATE_GRACE_MINUTES,
  OXYGEN_STALE_HOURS,
  OXYGEN_DAY_CLOSES_HOUR,
  isWorkingDay,
  clockText,
  stampText,
  slotCovered,
  slotCoverageFor,
  expectedSlot,
  nextSlot,
  scheduleState,
  ageText,
  freshnessTone,
  freshnessLabel,
  scheduleSentence,
} from '../../src/lib/oxygen/schedule';
import {
  OXYGEN_COMMENT_KINDS,
  OXYGEN_COMMENT_MIN_BODY,
  commentProblem,
  answerProblem,
  needsAnswer,
  openComments,
  sortComments,
  oxygenWhatsAppText,
  kindLabel,
  outcomeLabel,
  type OxygenComment,
} from '../../src/lib/oxygen/comment';

// 20 November 2026 is a Friday; 21 November a Saturday. Both appear below.
const FRI = (h: number, m = 0) => new Date(2026, 10, 20, h, m, 0, 0);
const SAT = (h: number, m = 0) => new Date(2026, 10, 21, h, m, 0, 0);
const MON = (h: number, m = 0) => new Date(2026, 10, 23, h, m, 0, 0);

describe('the posting rule itself', () => {
  it('is four postings: the morning one, then every two hours to 2 pm', () => {
    // THE REQUIREMENT, asserted directly. If somebody shortens the run or moves
    // the morning slot, this is the line that says so out loud rather than a
    // dozen downstream expectations quietly changing meaning.
    expect(OXYGEN_UPDATE_SLOTS.map((s) => `${s.hour}:${String(s.minute).padStart(2, '0')}`))
      .toEqual(['8:00', '10:00', '12:00', '14:00']);
  });

  it('spaces every posting after the first exactly two hours apart', () => {
    for (let i = 1; i < OXYGEN_UPDATE_SLOTS.length; i += 1) {
      const gap = (OXYGEN_UPDATE_SLOTS[i].hour * 60 + OXYGEN_UPDATE_SLOTS[i].minute)
        - (OXYGEN_UPDATE_SLOTS[i - 1].hour * 60 + OXYGEN_UPDATE_SLOTS[i - 1].minute);
      expect(gap, `gap before ${OXYGEN_UPDATE_SLOTS[i].key}`).toBe(120);
    }
  });

  it('names every slot once', () => {
    const keys = OXYGEN_UPDATE_SLOTS.map((s) => s.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('says the rule in words, from the same array', () => {
    // The sentence on the page is generated, not typed — so it cannot go on
    // claiming 2 pm after somebody extends the run to four.
    expect(scheduleSentence()).toContain('08:00, 10:00, 12:00, 14:00');
  });

  it('counts Monday to Friday as working days and nothing else', () => {
    expect(isWorkingDay(MON(9))).toBe(true);
    expect(isWorkingDay(FRI(9))).toBe(true);
    expect(isWorkingDay(SAT(9))).toBe(false);
    expect(isWorkingDay(new Date(2026, 10, 22, 9))).toBe(false); // Sunday
  });
});

describe('writing a time down', () => {
  it('pads to a fixed width and never uses the machine locale', () => {
    // toLocaleTimeString prints one way on this laptop and another on the
    // theatre server. A time that reads differently in two places is worse
    // than one nobody can read at all — this bit me once already, on the
    // plan-slippage note.
    expect(clockText(FRI(8, 0))).toBe('08:00');
    expect(clockText(FRI(14, 5))).toBe('14:05');
    expect(clockText(FRI(0, 0))).toBe('00:00');
  });

  it('writes a date the same way everywhere', () => {
    expect(stampText(FRI(14, 5))).toBe('20 Nov, 14:05');
  });

  it('describes an age in units a person uses', () => {
    expect(ageText(0)).toBe('just now');
    expect(ageText(40)).toBe('40 min');
    expect(ageText(60)).toBe('1 h');
    expect(ageText(135)).toBe('2 h 15 min');
    expect(ageText(60 * 26)).toBe('1 day');
    expect(ageText(60 * 72)).toBe('3 days');
  });
});

describe('which posting a report pays for', () => {
  it('counts a report against the slot it falls in', () => {
    expect(slotCovered(FRI(10, 5))?.key).toBe('T1000');
    expect(slotCovered(FRI(13, 59))?.key).toBe('T1200');
    expect(slotCovered(FRI(23, 0))?.key).toBe('T1400');
  });

  it('does not let an early report pay for the next slot in advance', () => {
    // THE POINT OF A CADENCE. A posting at 09:50 is a fresh look at the
    // manifold for the morning slot; it says nothing about 10 o'clock, and
    // treating it as though it did is how four postings become one.
    expect(slotCovered(FRI(9, 50))?.key).toBe('MORNING');
  });

  it('pays for nothing before the first slot of the day', () => {
    expect(slotCovered(FRI(7, 59))).toBeNull();
  });
});

describe('the day strip', () => {
  const at = (h: number, m = 0) => FRI(h, m);

  it('marks a covered slot with the time it was posted', () => {
    const strip = slotCoverageFor(FRI(11, 0), [at(8, 10), at(10, 2)], FRI(11, 0));
    expect(strip.map((s) => s.status)).toEqual(['COVERED', 'COVERED', 'UPCOMING', 'UPCOMING']);
    expect(clockText(strip[1].coveredAt!)).toBe('10:02');
  });

  it('gives a late slot its grace before calling it late', () => {
    const strip = slotCoverageFor(FRI(10, 20), [at(8, 10)], FRI(10, 20));
    // Twenty minutes past ten. A man walking the manifold is doing the job
    // asked of him and should not be red on four screens for it.
    expect(strip[1].status).toBe('DUE');
    expect(strip[1].minutesLate).toBe(20);

    const later = slotCoverageFor(FRI(10, 45), [at(8, 10)], FRI(10, 45));
    expect(later[1].status).toBe('LATE');
    expect(later[1].minutesLate).toBeGreaterThan(OXYGEN_UPDATE_GRACE_MINUTES);
  });

  it('does not credit a slot with a posting made the day before', () => {
    // The reports passed in are filtered to the day. A Thursday posting must
    // not light up Friday's strip, which would be the single most dangerous
    // thing this file could get wrong.
    const yesterday = new Date(2026, 10, 19, 10, 5);
    const strip = slotCoverageFor(FRI(11, 0), [yesterday], FRI(11, 0));
    expect(strip.every((s) => s.coveredAt === null)).toBe(true);
    expect(strip[1].status).toBe('LATE');
  });
});

describe('what the board should say right now', () => {
  it('has nothing to say before the morning posting is due', () => {
    expect(expectedSlot(FRI(7, 0))).toBeNull();
  });

  it('owes nothing at all at a weekend', () => {
    expect(expectedSlot(SAT(11, 0))).toBeNull();
  });

  it('rolls the next posting over the weekend to Monday morning', () => {
    const next = nextSlot(FRI(15, 0));
    expect(next?.slot.key).toBe('MORNING');
    expect(next?.at.getDate()).toBe(23);
  });

  it('calls the status current when the posting due has been made', () => {
    const s = scheduleState(FRI(11, 40), FRI(10, 2));
    expect(s.level).toBe('CURRENT');
    expect(s.message).toContain('10:02');
    expect(freshnessTone(s.level)).toBe('green');
  });

  it('calls it due, then late, as the silence lengthens', () => {
    expect(scheduleState(FRI(10, 15), FRI(8, 5)).level).toBe('DUE');
    const late = scheduleState(FRI(11, 40), FRI(8, 5));
    expect(late.level).toBe('LATE');
    expect(late.message).toContain('late');
    expect(freshnessTone(late.level)).toBe('red');
  });

  it('is quiet out of hours rather than red', () => {
    // 6 pm on a Friday with the 2 o'clock posting made. Nothing is owed, and a
    // red badge here would teach everybody to ignore red badges.
    const s = scheduleState(FRI(18, 0), FRI(14, 10));
    expect(s.level).toBe('OFF_SCHEDULE');
    expect(freshnessTone(s.level)).toBe('grey');
    expect(s.message).toContain('No update is due until');
  });

  it('still calls a day-old posting out of date at a weekend', () => {
    // The schedule owes nothing on Saturday. The readings are still a day old,
    // and a grey "nothing due" badge over them would be a lie of omission.
    const s = scheduleState(SAT(11, 0), new Date(2026, 10, 19, 14, 0));
    expect(s.level).toBe('STALE');
    expect(s.ageMinutes).toBeGreaterThan(OXYGEN_STALE_HOURS * 60);
    expect(freshnessTone(s.level)).toBe('red');
  });

  it('says plainly when nothing has ever been posted', () => {
    const s = scheduleState(FRI(11, 40), null);
    expect(s.level).toBe('NONE');
    expect(s.ageMinutes).toBeNull();
    expect(s.message).toContain('No oxygen status has been posted');
    expect(freshnessLabel(s.level)).toBe('Never posted');
  });

  it('is late, not merely old, when yesterday was the last posting', () => {
    // Twenty-one hours is under the stale threshold, so this reads as a
    // missed 10 o'clock rather than as an ancient board -- and says both,
    // because the age is the part that decides whether to trust the reading.
    const s = scheduleState(FRI(11, 40), new Date(2026, 10, 19, 14, 0));
    expect(s.level).toBe('LATE');
    expect(s.message).toContain('21 h');
  });

  it('reports no update today when the gap has run past a day', () => {
    // Monday morning after a Friday afternoon posting. Three days old and
    // nothing yet this morning: the thing to say is that today has produced
    // nothing, not that the 10 o'clock slot is an hour and forty late.
    const s = scheduleState(MON(11, 40), FRI(14, 0));
    expect(s.level).toBe('STALE');
    expect(s.message).toContain('No update today');
    // Friday 14:00 to Monday 11:40 is sixty-nine hours: two days, not three.
    expect(s.message).toContain('2 days');
  });

  it('stops calling a slot late once the posting day has closed', () => {
    // Found by this suite. Without a closing hour, a missed 14:00 stayed red
    // on every screen all evening and all weekend, asking nobody for anything.
    const evening = scheduleState(FRI(OXYGEN_DAY_CLOSES_HOUR, 30), FRI(12, 5));
    expect(evening.level).toBe('OFF_SCHEDULE');
    expect(expectedSlot(FRI(OXYGEN_DAY_CLOSES_HOUR, 30))).toBeNull();

    // And the day strip still records the miss, because that is the record
    // of the day and tidying it away is how a pattern of missed afternoons
    // becomes invisible.
    const strip = slotCoverageFor(FRI(20, 0), [FRI(12, 5)], FRI(20, 0));
    expect(strip[3].status).toBe('LATE');
  });

  it('never returns a negative age for a clock that ran backwards', () => {
    // Two nodes, two clocks. A report stamped a minute in the future must not
    // render as "-1 min ago", which reads as a bug and gets the whole panel
    // disbelieved.
    const s = scheduleState(FRI(11, 40), FRI(11, 41));
    expect(s.ageMinutes).toBe(0);
  });
});

describe('what theatre may say to the oxygen room', () => {
  it('offers exactly three things to say', () => {
    expect(OXYGEN_COMMENT_KINDS).toEqual([
      'CONFIRM_REQUEST', 'ADJUSTMENT_REQUEST', 'OBSERVATION',
    ]);
  });

  it('lets a confirmation go with no words at all', () => {
    // "Is this still right?" is complete on its own — the posting it points at
    // says everything. Demanding a sentence here is how a one-tap check
    // becomes a form nobody fills in.
    expect(commentProblem({ kind: 'CONFIRM_REQUEST', body: '' })).toBeNull();
  });

  it('refuses a blank request for an adjustment', () => {
    const p = commentProblem({ kind: 'ADJUSTMENT_REQUEST', body: ' ' });
    expect(p).toBeTruthy();
    expect(p).toContain('cannot act on a blank request');
    expect(commentProblem({
      kind: 'ADJUSTMENT_REQUEST',
      body: 'Theatre 2 outlet at 30 psi, please raise.',
    })).toBeNull();
  });

  it('holds an observation to the same floor as a request', () => {
    expect(commentProblem({ kind: 'OBSERVATION', body: 'ok' })).toBeTruthy();
    expect('ok'.length).toBeLessThan(OXYGEN_COMMENT_MIN_BODY);
  });

  it('refuses a kind it does not know', () => {
    expect(commentProblem({ kind: 'SHOUT', body: 'the bank is empty' })).toBeTruthy();
  });
});

describe('the oxygen room answering', () => {
  it('lets a plain confirmation stand on its own', () => {
    expect(answerProblem({ outcome: 'CONFIRMED', body: '' })).toBeNull();
  });

  it('makes the room say what it did, or why it could not', () => {
    // Somebody in a theatre is being told no. They have to decide what to do
    // about it, and "DECLINED" with no words is not something anybody can act on.
    expect(answerProblem({ outcome: 'DECLINED', body: '' })).toBeTruthy();
    expect(answerProblem({ outcome: 'ADJUSTED', body: '' })).toBeTruthy();
    expect(answerProblem({ outcome: 'ADJUSTED', body: 'Cylinder changed at 11:50.' })).toBeNull();
  });

  it('refuses an outcome it does not know', () => {
    expect(answerProblem({ outcome: 'MAYBE', body: 'we had a look' })).toBeTruthy();
  });
});

describe('what is still waiting on the oxygen room', () => {
  const base = {
    id: 'c1', reportId: null, reportedAt: null, theatreName: 'A&E Theatre',
    body: null, authorId: 'u1', authorName: 'Tech', authorRole: 'ANAESTHETIC_TECHNICIAN',
    createdAt: FRI(11, 0), answeredAt: null, answeredByName: null,
    answerOutcome: null, answerBody: null,
  };
  const comments: OxygenComment[] = [
    { ...base, id: 'a', kind: 'CONFIRM_REQUEST', status: 'OPEN', createdAt: FRI(11, 0) },
    { ...base, id: 'b', kind: 'ADJUSTMENT_REQUEST', status: 'ANSWERED', createdAt: FRI(12, 0) },
    { ...base, id: 'c', kind: 'OBSERVATION', status: 'OPEN', createdAt: FRI(13, 0) },
    { ...base, id: 'd', kind: 'ADJUSTMENT_REQUEST', status: 'OPEN', createdAt: FRI(9, 0) },
  ];

  it('counts an open request, and not an observation', () => {
    // An observation asks nothing of anybody. Counting it as outstanding gives
    // the oxygen room a queue that never empties, which is a queue they stop
    // looking at.
    expect(openComments(comments).map((c) => c.id)).toEqual(['a', 'd']);
    expect(needsAnswer({ kind: 'OBSERVATION', status: 'OPEN' })).toBe(false);
    expect(needsAnswer({ kind: 'CONFIRM_REQUEST', status: 'ANSWERED' })).toBe(false);
  });

  it('reads newest first, which is how a phone shows a thread', () => {
    expect(sortComments(comments).map((c) => c.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('does not mutate the list it was handed', () => {
    const before = comments.map((c) => c.id);
    sortComments(comments);
    expect(comments.map((c) => c.id)).toEqual(before);
  });
});

describe('the WhatsApp message to the oxygen room', () => {
  const text = oxygenWhatsAppText({
    kind: 'ADJUSTMENT_REQUEST',
    body: 'Theatre 2 wall outlet at 30 psi.',
    theatreName: 'A&E Theatre',
    authorName: 'A. Technician',
    authorRole: 'ANAESTHETIC_TECHNICIAN',
    statusLine: 'GOOD · 50 psi · bank 70%',
  });

  it('leads with what is being asked, then where', () => {
    const lines = text.split('\n');
    expect(lines[1]).toBe('REQUEST ADJUSTMENT');
    expect(text).toContain('Theatre: A&E Theatre');
    expect(text).toContain('Theatre 2 wall outlet at 30 psi.');
  });

  it('attributes it to a person, in words a person reads', () => {
    expect(text).toContain('— A. Technician, anaesthetic technician');
  });

  it('carries no telephone number and no patient', () => {
    // It is addressed TO a number; it must never contain one. The same rule
    // the chase messages follow — a number forwarded in a message body is a
    // number that ends up in a group chat.
    expect(text).not.toMatch(/\b0\d{10}\b/);
    expect(text).not.toMatch(/\bwa\.me\b/);
  });

  it('survives a comment with nothing written in it', () => {
    const plain = oxygenWhatsAppText({ kind: 'CONFIRM_REQUEST', authorName: 'Nurse' });
    expect(plain).toContain('CONFIRM STATUS');
    expect(plain).toContain('— Nurse');
    expect(plain).not.toContain('undefined');
    expect(plain).not.toContain('""');
  });
});

describe('the words on the screen', () => {
  it('labels every kind and every outcome', () => {
    for (const k of OXYGEN_COMMENT_KINDS) {
      expect(kindLabel(k)).not.toBe('Comment');
    }
    for (const o of ['CONFIRMED', 'ADJUSTED', 'DECLINED']) {
      expect(outcomeLabel(o)).not.toBe('Answered');
    }
  });

  it('falls back rather than printing a raw enum at somebody', () => {
    expect(kindLabel('WHAT')).toBe('Comment');
    expect(outcomeLabel(null)).toBe('Answered');
  });
});
