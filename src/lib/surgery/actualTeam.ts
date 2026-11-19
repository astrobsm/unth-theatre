// ============================================================
// Who was actually in the room, and what that adds up to
// ------------------------------------------------------------
// A surgery row names the surgeon who was BOOKED. On most lists here that is
// the consultant who put the case up, and the person who held the knife was a
// senior registrar. Both facts are true; the record held only the first. So
// every figure ever drawn from surgeonId answered "whose list was this" while
// reading as though it answered "who did this" -- and the assistants, recorded
// at booking as an intention and never confirmed, did not appear at all.
//
// The anaesthetist is here for the same reason and is swapped more often than
// anybody. The anaesthetic rota is drawn up after the lists are, so the name
// on surgeries.anesthetistId at booking is frequently a placeholder that
// nobody ever went back to correct -- and an anaesthetist's own record of what
// they gave an anaesthetic for was therefore somebody else's list.
//
// This module holds the two halves of the fix and nothing else: reading the
// confirmed team out of an append-only log, and adding those teams up into a
// record per person. Both are pure, because both are read by a screen that
// shows people their own numbers and by a board that shows those numbers to
// their head of department, and those two must never be able to disagree.
// ============================================================

import { isAssisting, gradeForAccountRole, type TeamGrade } from './assistants';

export const ACTUAL_TEAM_ROLES = [
  'PRIMARY_SURGEON',
  'ASSISTANT',
  'ANAESTHETIST',
  'ANAESTHETIC_ASSISTANT',
] as const;
export type ActualTeamRole = (typeof ACTUAL_TEAM_ROLES)[number];

export function isActualTeamRole(v: unknown): v is ActualTeamRole {
  return typeof v === 'string' && (ACTUAL_TEAM_ROLES as readonly string[]).includes(v);
}

/** What a role is called on screen. */
export const ACTUAL_ROLE_LABEL: Record<ActualTeamRole, string> = {
  PRIMARY_SURGEON: 'Operating surgeon',
  ASSISTANT: 'Assistant',
  ANAESTHETIST: 'Anaesthetist',
  ANAESTHETIC_ASSISTANT: 'Anaesthetic assistant',
};

/** The order the posts are read out in, and written in. */
export const ROLE_ORDER: ActualTeamRole[] = [
  'PRIMARY_SURGEON',
  'ASSISTANT',
  'ANAESTHETIST',
  'ANAESTHETIC_ASSISTANT',
];

export const SURGICAL_ROLES: ActualTeamRole[] = ['PRIMARY_SURGEON', 'ASSISTANT'];
export const ANAESTHETIC_ROLES: ActualTeamRole[] = ['ANAESTHETIST', 'ANAESTHETIC_ASSISTANT'];

/** One row of surgery_actual_team. */
export interface ActualTeamRow {
  surgeryId?: string;
  confirmationId: string;
  confirmedAt: Date | string;
  confirmedById: string;
  confirmedByName: string;
  userId?: string | null;
  memberName: string;
  staffCode?: string | null;
  role: ActualTeamRole;
  grade?: string | null;
  position: number;
  notes?: string | null;
}

export interface ConfirmedTeam {
  confirmationId: string;
  confirmedAt: Date;
  confirmedById: string;
  confirmedByName: string;
  /** Operating surgeon first, then assistants in order. */
  members: ActualTeamRow[];
  /** How many confirmations came before this one. 0 means never corrected. */
  correctionCount: number;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The team as it stands, from the whole append-only log for one case.
 *
 * The newest confirmation wins. A later set is a human deliberately correcting
 * the earlier one, which is the entire point of the feature -- so the standing
 * rule that the EARLIEST timestamped record wins is deliberately not applied
 * here. That rule governs two nodes holding rival versions of one booking,
 * where the first is the true one and the second is an echo. This is neither.
 *
 * WHERE TWO CONFIRMATIONS SHARE A TIMESTAMP, which happens when the theatre
 * server and the cloud each take one within the same millisecond, the tie is
 * broken on confirmationId. Any rule would do; what matters is that it is the
 * SAME rule on both nodes, so the two never render different teams for the
 * same case and never flap as rows arrive in a different order.
 */
export function currentTeam(rows: ActualTeamRow[]): ConfirmedTeam | null {
  if (!rows || rows.length === 0) return null;

  const sets = new Map<string, ActualTeamRow[]>();
  for (const r of rows) {
    if (!r?.confirmationId) continue;
    const list = sets.get(r.confirmationId);
    if (list) list.push(r);
    else sets.set(r.confirmationId, [r]);
  }
  if (sets.size === 0) return null;

  const ranked = Array.from(sets.entries())
    .map(([confirmationId, members]) => ({
      confirmationId,
      members,
      at: asDate(members[0].confirmedAt)?.getTime() ?? 0,
    }))
    .sort((a, b) => (b.at - a.at) || b.confirmationId.localeCompare(a.confirmationId));

  const winner = ranked[0];
  // BY POST FIRST, THEN BY POSITION WITHIN IT. Position is numbered from each
  // post own first -- the first assistant is position 0 among assistants --
  // so sorting on position alone ties the operating surgeon against the first
  // assistant and falls through to whichever name sorts earlier. An operation
  // note that opens with the assistant is wrong in the way nobody checks.
  const rank = (r: ActualTeamRow) => {
    const i = ROLE_ORDER.indexOf(r.role);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  const members = [...winner.members].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.position ?? 0) - (b.position ?? 0) ||
      a.memberName.localeCompare(b.memberName),
  );

  return {
    confirmationId: winner.confirmationId,
    confirmedAt: asDate(members[0].confirmedAt) ?? new Date(0),
    confirmedById: members[0].confirmedById,
    confirmedByName: members[0].confirmedByName,
    members,
    correctionCount: ranked.length - 1,
  };
}

/** Every confirmation, newest first — the correction trail. */
export function confirmationHistory(rows: ActualTeamRow[]): ConfirmedTeam[] {
  const seen = new Set<string>();
  const out: ConfirmedTeam[] = [];
  let remaining = rows;
  while (remaining.length) {
    const top = currentTeam(remaining);
    if (!top || seen.has(top.confirmationId)) break;
    seen.add(top.confirmationId);
    out.push(top);
    remaining = remaining.filter((r) => r.confirmationId !== top.confirmationId);
  }
  return out;
}

// ── Writing a confirmation ──────────────────────────────────────────────────

export interface DraftMember {
  userId?: string | null;
  memberName: string;
  staffCode?: string | null;
  role: ActualTeamRole;
  grade?: string | null;
  notes?: string | null;
}

/**
 * What is wrong with this team, in words the person confirming it will read.
 * Null means it may be saved.
 *
 * ONE OPERATING SURGEON. Not because two never scrub, but because the consent
 * form, the deposit and the theatre list each name one, and a record that
 * allowed two would disagree with all three. A second surgeon of equal
 * standing goes down as an assistant with a note saying so, which is what the
 * operation note has always said.
 *
 * UP TO TWO ANAESTHETISTS, AND SOMETIMES NONE.
 *
 * None, because a case done under local anaesthetic by the surgeon has no
 * anaesthetist, and demanding one would make the form unfillable for a whole
 * category of list.
 *
 * Two, because a relief mid-case is an ordinary event on a long list and both
 * people genuinely gave that anaesthetic. The surgeon rule does not apply here
 * and the asymmetry is deliberate: one operating surgeon is forced by the
 * consent form, the deposit and the theatre list, which each name one, and
 * nothing equivalent constrains who held the airway at two in the afternoon.
 * The case counts on BOTH their records, because both did it -- this is a
 * record of work done, not a division of one case into halves.
 *
 * Three is refused. At that point the list is being used to record a rota
 * rather than a case, and the people after the second relief belong under
 * anaesthetic assistant with a note saying when they came.
 */
/**
 * How many anaesthetists one case may name.
 *
 * Two: the one who started and the one who relieved them. A third is a rota,
 * not a case.
 */
export const MAX_ANAESTHETISTS = 2;

export function teamProblem(members: DraftMember[]): string | null {
  const named = (members ?? []).filter((m) => (m?.memberName ?? '').trim() !== '');
  if (named.length === 0) {
    return 'Name at least the surgeon who operated.';
  }

  const primaries = named.filter((m) => m.role === 'PRIMARY_SURGEON');
  if (primaries.length === 0) {
    return 'Say which of these was the operating surgeon.';
  }
  if (primaries.length > 1) {
    return 'Only one operating surgeon. Record the others as assistants — the consent form, the deposit and the theatre list each name one surgeon, and a second here would disagree with all three.';
  }

  const anaesthetists = named.filter((m) => m.role === 'ANAESTHETIST');
  if (anaesthetists.length > MAX_ANAESTHETISTS) {
    return `At most ${MAX_ANAESTHETISTS} anaesthetists on a case. Where a third took over, record them as an anaesthetic assistant and say when in the note.`;
  }

  const seen = new Set<string>();
  for (const m of named) {
    const key = m.userId ? `id:${m.userId}` : `name:${m.memberName.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return `${m.memberName.trim()} is on this team twice. One person, one line.`;
    }
    seen.add(key);
  }

  return null;
}

/**
 * The draft rows, ordered and cleaned, ready to be written as one confirmation.
 *
 * Grouped by post in ROLE_ORDER, and within a post in the order they were
 * given. Position is assigned WITHIN the post, not across the whole team:
 * "the first assistant" is a different claim from "an assistant" and an
 * operation note has always said which, but the first assistant is still the
 * first assistant whether or not an anaesthetic assistant was present.
 */
export function orderForWriting(members: DraftMember[]): Array<DraftMember & { position: number }> {
  const named = (members ?? [])
    .filter((m) => (m?.memberName ?? '').trim() !== '')
    .map((m) => ({ ...m, memberName: m.memberName.trim() }));

  const out: Array<DraftMember & { position: number }> = [];
  for (const role of ROLE_ORDER) {
    const inRole = named.filter((m) => m.role === role);
    inRole.forEach((m, i) => out.push({ ...m, position: i }));
  }
  return out;
}

// ── Pre-filling from the booking ────────────────────────────────────────────

export interface BookingSource {
  surgeonId?: string | null;
  surgeonName?: string | null;
  assistantSurgeonId?: string | null;
  anesthetistId?: string | null;
  /** IntraOperativeRecord.nurseAnesthetistId, where one was recorded. */
  nurseAnesthetistId?: string | null;
  /** Names for the ids above, where the caller resolved them. */
  people?: Array<{ id: string; fullName: string; staffCode?: string | null; role?: string | null }>;
  /** surgical_team_members rows for the case. */
  bookedMembers?: Array<{
    userId?: string | null;
    memberName?: string | null;
    role?: string | null;
    specialNotes?: string | null;
  }>;
}

/**
 * The team as booked, as a starting point for the confirmation.
 *
 * PRE-FILLED, NOT ASSUMED. The form opens with the booked team already in it
 * because most of the time it is right and retyping four names to change one is
 * how a form stops being filled in. But nothing is written until somebody
 * presses confirm: an unconfirmed case counts for nobody, which is what makes
 * the figure mean anything at all.
 */
export function prefillFromBooking(src: BookingSource): DraftMember[] {
  const people = new Map((src.people ?? []).map((p) => [p.id, p]));
  const out: DraftMember[] = [];
  const seen = new Set<string>();

  const push = (m: DraftMember) => {
    const name = (m.memberName ?? '').trim();
    if (!name) return;
    const key = m.userId ? `id:${m.userId}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...m, memberName: name });
  };

  const surgeon = src.surgeonId ? people.get(src.surgeonId) : undefined;
  push({
    userId: src.surgeonId ?? null,
    memberName: surgeon?.fullName ?? (src.surgeonName ?? ''),
    staffCode: surgeon?.staffCode ?? null,
    role: 'PRIMARY_SURGEON',
    grade: surgeon ? gradeForAccountRole(surgeon.role) : null,
  });

  const assistant = src.assistantSurgeonId ? people.get(src.assistantSurgeonId) : undefined;
  if (assistant) {
    push({
      userId: assistant.id,
      memberName: assistant.fullName,
      staffCode: assistant.staffCode ?? null,
      role: 'ASSISTANT',
      grade: gradeForAccountRole(assistant.role),
    });
  }

  // The rest of the assisting surgeons, which is where the second and third go
  // — surgical_team_members rows marked "Assisting" by the booking form.
  for (const m of src.bookedMembers ?? []) {
    if (!isAssisting(m.specialNotes)) continue;
    push({
      userId: m.userId ?? null,
      memberName: m.memberName ?? '',
      role: 'ASSISTANT',
      grade: m.role ?? null,
    });
  }

  // Anaesthesia. Offered only where the booking actually named somebody: a
  // case done under local by the surgeon has no anaesthetist, and an empty
  // row labelled "Anaesthetist" is an invitation to put a name in one.
  const anaesthetist = src.anesthetistId ? people.get(src.anesthetistId) : undefined;
  if (anaesthetist) {
    push({
      userId: anaesthetist.id,
      memberName: anaesthetist.fullName,
      staffCode: anaesthetist.staffCode ?? null,
      role: 'ANAESTHETIST',
      grade: gradeForAccountRole(anaesthetist.role),
    });
  }

  const nurseAnaesthetist = src.nurseAnesthetistId ? people.get(src.nurseAnesthetistId) : undefined;
  if (nurseAnaesthetist) {
    push({
      userId: nurseAnaesthetist.id,
      memberName: nurseAnaesthetist.fullName,
      staffCode: nurseAnaesthetist.staffCode ?? null,
      role: 'ANAESTHETIC_ASSISTANT',
      grade: gradeForAccountRole(nurseAnaesthetist.role),
    });
  }

  return out;
}

/** Did the booked team and the confirmed team differ, and how? */
export function describeChange(booked: DraftMember[], confirmed: ActualTeamRow[]): string | null {
  const key = (m: { userId?: string | null; memberName: string }) =>
    m.userId ? `id:${m.userId}` : `name:${m.memberName.trim().toLowerCase()}`;

  const bookedPrimary = booked.find((m) => m.role === 'PRIMARY_SURGEON');
  const actualPrimary = confirmed.find((m) => m.role === 'PRIMARY_SURGEON');

  const notes: string[] = [];
  if (bookedPrimary && actualPrimary && key(bookedPrimary) !== key(actualPrimary)) {
    notes.push(`${actualPrimary.memberName} operated, not ${bookedPrimary.memberName}`);
  }

  // Compared as SETS, because a case may name two anaesthetists and a relief
  // that went unmentioned is exactly the change worth reporting.
  const bookedGas = booked.filter((m) => m.role === 'ANAESTHETIST');
  const actualGas = confirmed.filter((m) => m.role === 'ANAESTHETIST');
  const bookedGasKeys = new Set(bookedGas.map(key));
  const newGas = actualGas.filter((m) => !bookedGasKeys.has(key(m)));
  if (newGas.length && bookedGas.length) {
    notes.push(
      `${newGas.map((m) => m.memberName).join(' and ')} gave the anaesthetic, not ${bookedGas.map((m) => m.memberName).join(' and ')}`,
    );
  } else if (newGas.length) {
    notes.push(`${newGas.map((m) => m.memberName).join(' and ')} gave the anaesthetic; none was booked`);
  }

  const bookedAssist = new Set(booked.filter((m) => m.role === 'ASSISTANT').map(key));
  const actualAssist = confirmed.filter((m) => m.role === 'ASSISTANT');
  const added = actualAssist.filter((m) => !bookedAssist.has(key(m)));
  if (added.length) {
    notes.push(`${added.map((m) => m.memberName).join(', ')} assisted and ${added.length === 1 ? 'was' : 'were'} not booked`);
  }

  return notes.length ? notes.join('; ') : null;
}

// ── What it adds up to ──────────────────────────────────────────────────────

/** One completed case, with its confirmed team, as the board needs it. */
export interface CaseFact {
  surgeryId: string;
  unit?: string | null;
  subspecialty?: string | null;
  procedureName?: string | null;
  scheduledDate: Date | string;
  /** "09:00". */
  scheduledTime?: string | null;
  estimatedDuration?: number | null;
  actualStartTime?: Date | string | null;
  knifeOnSkinTime?: Date | string | null;
  actualEndTime?: Date | string | null;
  surgeryEndTime?: Date | string | null;
  complexityClass?: string | null;
  team: ActualTeamRow[];
}

/**
 * When the case was meant to start, from the booked date and the booked time.
 *
 * Built in LOCAL time deliberately. scheduledTime is a string a human typed and
 * reads on a wall clock, and every other screen in this app composes the two
 * the same way. This machine runs on WAT, an hour ahead of UTC, so composing
 * them in UTC would report every case in the hospital as an hour late.
 */
export function scheduledStart(
  scheduledDate: Date | string,
  scheduledTime?: string | null,
): Date | null {
  const d = asDate(scheduledDate);
  if (!d) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec((scheduledTime ?? '').trim());
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (hours > 23 || mins > 59) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, mins, 0, 0);
}

/** When the knife went in, preferring the explicit record over the inferred one. */
export function startedAt(c: CaseFact): Date | null {
  return asDate(c.knifeOnSkinTime) ?? asDate(c.actualStartTime);
}

export function endedAt(c: CaseFact): Date | null {
  return asDate(c.actualEndTime) ?? asDate(c.surgeryEndTime);
}

/** Minutes late off the blocks. Negative means it started early. */
export function startDelayMinutes(c: CaseFact): number | null {
  const planned = scheduledStart(c.scheduledDate, c.scheduledTime);
  const actual = startedAt(c);
  if (!planned || !actual) return null;
  return Math.round((actual.getTime() - planned.getTime()) / 60000);
}

/** How long the case took, knife to close. */
export function durationMinutes(c: CaseFact): number | null {
  const a = startedAt(c);
  const b = endedAt(c);
  if (!a || !b) return null;
  const mins = Math.round((b.getTime() - a.getTime()) / 60000);
  // A negative or absurd span is a mistyped time, not a twenty-hour operation.
  // Counting it would move a median more than the case it describes is worth.
  if (mins < 0 || mins > 24 * 60) return null;
  return mins;
}

/** Minutes past the time the case was booked to need. */
export function overrunMinutes(c: CaseFact): number | null {
  const actual = durationMinutes(c);
  const planned = c.estimatedDuration ?? null;
  if (actual === null || !planned || planned <= 0) return null;
  return actual - planned;
}

/** Later than this and a start counts as late. Fifteen minutes is a theatre's
 *  ordinary slack; below it, "late" would mean nothing. */
export const LATE_START_MINUTES = 15;

/** Over this much past the booked duration and a case counts as having overrun. */
export const OVERRUN_MINUTES = 30;

export interface PersonRecord {
  userId: string | null;
  name: string;
  staffCode: string | null;
  /** Cases where they were the operating surgeon. */
  operated: number;
  /** Cases where they assisted at the table. */
  assisted: number;
  /** Cases where they gave the anaesthetic. */
  anaesthetised: number;
  /** Cases where they assisted with the anaesthetic. */
  anaesthesiaAssisted: number;
  total: number;
  /** Every post they filled, by the grade they were recorded at: a consultant
   *  who assisted a registrar is a consultant doing an assistant's job, and
   *  both halves of that matter to a training record. */
  byGrade: Record<string, Partial<Record<ActualTeamRole, number>>>;
  /** Which units' lists they appeared on. */
  units: string[];
  /** Of their assists, how many were first assistant rather than second. */
  firstAssistant: number;

  // Timeliness. Each figure carries the number of cases it could be measured
  // on, because a median over three cases and a median over forty are
  // different claims and a board that prints them identically invites the
  // wrong one to be acted on.
  startMeasured: number;
  startedLate: number;
  medianStartDelay: number | null;
  durationMeasured: number;
  medianDuration: number | null;
  overrunMeasured: number;
  overran: number;
  medianOverrun: number | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Each person's record across a set of completed, confirmed cases.
 *
 * MEDIAN, NOT MEAN, on every duration. One case that ran five hours because a
 * bowel was resected mid-procedure would drag a mean far enough to make a
 * surgeon with twenty ordinary lists look slow, and the person reading the
 * board has no way to see that from the number. The median moves only when the
 * typical case moves, which is the thing anybody actually wants to know.
 *
 * A START DELAY IS NOT A PERSONAL FIGURE AND MUST NOT BE READ AS ONE. A case
 * starts late because the list before it overran, because the porter was on
 * another floor, because the consent was not signed, because no anaesthetist
 * was free, or because the surgeon was not there. One row of this table cannot
 * tell those apart and does not try. It is counted because a delay nobody
 * measures is a delay nobody fixes, and every screen that shows it is obliged
 * to carry this sentence with it.
 *
 * The same figure sits against the anaesthetist, who is frequently the person
 * waiting rather than the person late -- which is precisely why it is a
 * THEATRE figure shown per person, and not a mark against a name.
 */
export function summarise(cases: CaseFact[]): PersonRecord[] {
  const byPerson = new Map<string, PersonRecord & {
    _startDelays: number[];
    _durations: number[];
    _overruns: number[];
    _units: Set<string>;
  }>();

  for (const c of cases ?? []) {
    const team = c.team ?? [];
    if (team.length === 0) continue;

    const delay = startDelayMinutes(c);
    const dur = durationMinutes(c);
    const over = overrunMinutes(c);

    for (const m of team) {
      const key = m.userId ? `id:${m.userId}` : `name:${m.memberName.trim().toLowerCase()}`;
      let rec = byPerson.get(key);
      if (!rec) {
        rec = {
          userId: m.userId ?? null,
          name: m.memberName,
          staffCode: m.staffCode ?? null,
          operated: 0,
          assisted: 0,
          anaesthetised: 0,
          anaesthesiaAssisted: 0,
          total: 0,
          byGrade: {},
          units: [],
          firstAssistant: 0,
          startMeasured: 0,
          startedLate: 0,
          medianStartDelay: null,
          durationMeasured: 0,
          medianDuration: null,
          overrunMeasured: 0,
          overran: 0,
          medianOverrun: null,
          _startDelays: [],
          _durations: [],
          _overruns: [],
          _units: new Set<string>(),
        };
        byPerson.set(key, rec);
      }

      switch (m.role) {
        case 'PRIMARY_SURGEON':
          rec.operated += 1;
          break;
        case 'ASSISTANT':
          rec.assisted += 1;
          // Position is assigned within the post, so 0 IS the first
          // assistant. It is not the operating surgeon's slot.
          if ((m.position ?? 0) === 0) rec.firstAssistant += 1;
          break;
        case 'ANAESTHETIST':
          rec.anaesthetised += 1;
          break;
        case 'ANAESTHETIC_ASSISTANT':
          rec.anaesthesiaAssisted += 1;
          break;
        default:
          break;
      }
      rec.total += 1;

      const grade = m.grade || 'UNRECORDED';
      const g = rec.byGrade[grade] ?? {};
      g[m.role] = (g[m.role] ?? 0) + 1;
      rec.byGrade[grade] = g;

      if (c.unit) rec._units.add(c.unit);
      if (!rec.staffCode && m.staffCode) rec.staffCode = m.staffCode;

      if (delay !== null) {
        rec.startMeasured += 1;
        rec._startDelays.push(delay);
        if (delay > LATE_START_MINUTES) rec.startedLate += 1;
      }
      if (dur !== null) {
        rec.durationMeasured += 1;
        rec._durations.push(dur);
      }
      if (over !== null) {
        rec.overrunMeasured += 1;
        rec._overruns.push(over);
        if (over > OVERRUN_MINUTES) rec.overran += 1;
      }
    }
  }

  return Array.from(byPerson.values())
    .map((r) => {
      const { _startDelays, _durations, _overruns, _units, ...rest } = r;
      return {
        ...rest,
        units: Array.from(_units).sort(),
        medianStartDelay: median(_startDelays),
        medianDuration: median(_durations),
        medianOverrun: median(_overruns),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/**
 * How much of the period's work has a confirmed team at all.
 *
 * The honest headline. Every figure on the board is drawn only from confirmed
 * cases, so a board built on a third of the list is a board that will be
 * believed and should not be. This is printed above the table, not in a
 * footnote.
 */
export function confirmationCoverage(
  completed: number,
  confirmed: number,
): { completed: number; confirmed: number; unconfirmed: number; share: number | null } {
  if (completed <= 0) return { completed: 0, confirmed: 0, unconfirmed: 0, share: null };
  return {
    completed,
    confirmed,
    unconfirmed: completed - confirmed,
    share: confirmed / completed,
  };
}

export type { TeamGrade };
