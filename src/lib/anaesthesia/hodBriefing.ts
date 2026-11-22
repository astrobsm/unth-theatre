/**
 * The whole day's unreviewed list, written to the Head of Anaesthesia.
 *
 * The board already chases ONE case at a time, at the person named on it. That
 * is the right instrument for one registrar who forgot, and the wrong one for
 * what the board usually shows the evening before a list: seven cases, no
 * reviews, and a different name against each. Chasing seven people one at a
 * time puts the department's problem to seven individuals and never puts it to
 * the person who can actually move the rota.
 *
 * So this is one message, to one person, naming every case that has no review
 * and who was expected to do it.
 *
 * TWO THINGS IT MUST SAY THAT A CHASE DOES NOT.
 *
 * First, what the position IS under the current policy -- the 19:00 hand-back
 * window, the 21:00 review deadline, and the fact that a case still unreviewed
 * after 21:00 is recorded against a named person. A head of department being
 * asked to act is owed the rule they are being asked to act under.
 *
 * Second, and this is the part nobody outside theatre sees coming: a missing
 * anaesthetic review stops the PHARMACY and the CONSUMABLE PACK PROVIDER
 * working at all. Management has banned paper prescriptions, so there is no
 * longer a way round it on the morning. The review is where the anaesthetic
 * drugs and consumables enter the system; until it exists the pharmacy has
 * nothing to dispense against, the pack provider has nothing to pack, and the
 * patient cannot even be told what to pay for. The case does not merely lack a
 * review -- it arrives with no pack.
 *
 * Pure: no database, no network. The wording is the part that has to be
 * arguable against a test rather than discovered in somebody's WhatsApp.
 */

/**
 * States in which a listed case has no review recorded.
 *
 * SETTLED and REVIEWED are out for the obvious reason. PATIENT_NOT_IN_WARD is
 * out of THIS list and into its own: an anaesthetist walked to the ward and
 * the patient was not in it, which is a finding against the list rather than
 * against the reviewer, and burying it among defaults would misname somebody
 * who did exactly what was asked of them.
 */
export const UNREVIEWED_STATES = [
  'AWAITING',
  'AWAITING_REASSIGNMENT',
  'HANDBACK_WINDOW_CLOSED',
  'LAPSED',
] as const;

export function isUnreviewed(state: string | null | undefined): boolean {
  return (UNREVIEWED_STATES as readonly string[]).includes((state ?? '').trim());
}

export function attendedNotInWard(state: string | null | undefined): boolean {
  return (state ?? '').trim() === 'PATIENT_NOT_IN_WARD';
}

export interface BriefCase {
  patientName: string | null;
  folderNumber: string | null;
  procedureName: string;
  scheduledTime: string | null;
  unit: string | null;
  surgeonName: string | null;
  state: string;
  /** Who the board says is expected to review it. */
  reviewers: { name: string; grade?: string | null }[];
  /** Set when the HOD has already named somebody else. */
  reassignedToName?: string | null;
  handedBackAt?: string | null;
  handedBackReason?: string | null;
  patientAbsentByName?: string | null;
  patientAbsentReason?: string | null;
}

const GRADE_WORDS: Record<string, string> = {
  REGISTRAR: 'registrar',
  SENIOR_REGISTRAR: 'senior registrar',
  CONSULTANT: 'consultant',
};

function gradeWord(grade: string | null | undefined): string | null {
  const key = (grade ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return GRADE_WORDS[key] ?? null;
}

/**
 * Who answers for this case, in the words the message uses.
 *
 * A reassignment outranks the roster: once the HOD has named somebody, that is
 * who is expected, and still naming the original pair would be writing to a
 * head of department about a decision they themselves made.
 */
export function responsibleFor(c: BriefCase): string {
  const reassigned = (c.reassignedToName ?? '').trim();
  if (reassigned) return `${reassigned} (reassigned)`;

  const named = c.reviewers
    .map((r) => {
      const n = r.name.trim();
      if (!n) return '';
      const g = gradeWord(r.grade);
      return g ? `${n} (${g})` : n;
    })
    .filter(Boolean);

  if (named.length === 0) {
    // The worst case on the board and the one most easily missed: nobody is
    // named, so no chase can land anywhere and no deadline can be recorded
    // against anybody. It is a hole in the rota, not a defaulter.
    return 'NOBODY NAMED — no reviewer on the roster or the booking';
  }
  return named.join(' and ');
}

export interface BriefingSplit {
  unreviewed: BriefCase[];
  attended: BriefCase[];
}

export function splitForBriefing(cases: BriefCase[]): BriefingSplit {
  return {
    unreviewed: cases.filter((c) => isUnreviewed(c.state)),
    attended: cases.filter((c) => attendedNotInWard(c.state)),
  };
}

/** Why there is nothing to send, or null when there is. */
export function briefingProblem(cases: BriefCase[]): string | null {
  if (cases.length === 0) {
    return 'There are no cases listed for this day, so there is nothing to report.';
  }
  const { unreviewed, attended } = splitForBriefing(cases);
  if (unreviewed.length === 0 && attended.length === 0) {
    return 'Every case on this list has a review recorded. There is nothing to send, '
      + 'and a briefing saying so would be the kind of message that stops being read.';
  }
  if (unreviewed.length === 0) {
    // Only ward-absence findings. Worth sending, but it is a different letter:
    // nobody has defaulted, and the surgical teams have already been written
    // to by the absence action itself.
    return 'The only cases without a review are ones an anaesthetist attended and found '
      + 'the patient absent from the ward. Those are findings against the list, not '
      + 'against the department, and the surgical teams have already been written to.';
  }
  return null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "Monday 23 November 2026", from a YYYY-MM-DD day.
 *
 * Composed from local parts and never toLocaleDateString: this machine and the
 * theatre server are both WAT but print differently, and a date that reads one
 * way on the board and another in the HOD's WhatsApp is what an argument the
 * following morning turns on.
 */
export function longDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((day ?? '').trim());
  if (!m) return day ?? '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return day;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * "09:00" from a Date, an ISO timestamp or a wall-clock string.
 *
 * It takes a Date as well as a string because the deadlines come off
 * handbackDeadline()/reviewDeadline(), which return Dates, while the board's
 * JSON turns them into ISO strings on the way to the browser. One function
 * that reads both beats two that disagree about which it is.
 */
function timeText(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${String(value.getHours()).padStart(2, '0')}:`
      + `${String(value.getMinutes()).padStart(2, '0')}`;
  }
  const v = (value ?? '').trim();
  if (!v) return null;
  if (/^\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const STATE_NOTE: Record<string, string> = {
  AWAITING: 'no review yet',
  AWAITING_REASSIGNMENT: 'handed back — needs reassigning',
  HANDBACK_WINDOW_CLOSED: 'past the 19:00 hand-back window, still unreviewed',
  LAPSED: 'MISSED THE 21:00 DEADLINE',
};

/** One line per case, numbered, for the body of the message. */
export function caseLine(c: BriefCase, index: number): string {
  const time = timeText(c.scheduledTime);
  const head = [
    `${index + 1}.`,
    time ?? '(no time)',
    c.unit?.trim() ? `· ${c.unit.trim()}` : '',
  ].filter(Boolean).join(' ');

  const who = c.patientName?.trim() || 'Patient not named';
  const folder = c.folderNumber?.trim() ? ` (${c.folderNumber.trim()})` : '';
  const note = STATE_NOTE[c.state] ?? 'no review yet';

  const parts = [
    `${head}`,
    `   ${who}${folder} — ${c.procedureName}`,
    c.surgeonName?.trim() ? `   Surgeon: ${c.surgeonName.trim()}` : '',
    `   Expected reviewer: ${responsibleFor(c)}`,
    `   Status: ${note}`,
  ];
  if (c.handedBackReason?.trim()) {
    parts.push(`   Handed back: ${c.handedBackReason.trim()}`);
  }
  return parts.filter(Boolean).join('\n');
}

export interface HodBriefingInput {
  /** The list day, YYYY-MM-DD. */
  day: string;
  /** The deadlines, as a Date from the rules or an ISO string from the board. */
  handbackBy?: Date | string | null;
  reviewBy?: Date | string | null;
  /** Every case on that day's board. */
  cases: BriefCase[];
  /** Who it is addressed to, when an account holds the post. */
  hodName?: string | null;
  senderName?: string | null;
  senderRole?: string | null;
  /** When it was composed, for the "as at" line. */
  now?: Date;
}

/** "Dear Prof Okeke," — the honorific they already carry, kept. */
function salutation(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return 'Dear Head of Anaesthesia,';
  return `Dear ${n},`;
}

export function buildHodBriefing(input: HodBriefingInput): string {
  const { unreviewed, attended } = splitForBriefing(input.cases);
  const handbackBy = timeText(input.handbackBy) ?? '19:00';
  const reviewBy = timeText(input.reviewBy) ?? '21:00';
  const at = input.now ?? new Date();
  const asAt = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

  const lines: string[] = [
    '*UNIVERSITY OF NIGERIA TEACHING HOSPITAL, ITUKU-OZALLA*',
    'Theatre Complex — Preoperative review watch',
    '',
    salutation(input.hodName),
    '',
    `As at ${asAt} today, *${unreviewed.length} of the ${input.cases.length} case`
    + `${input.cases.length === 1 ? '' : 's'} listed for ${longDay(input.day)}* `
    + `${unreviewed.length === 1 ? 'has' : 'have'} no anaesthetic review recorded.`,
    '',
    '*CASES WITHOUT A REVIEW*',
    '',
  ];

  unreviewed.forEach((c, i) => {
    lines.push(caseLine(c, i), '');
  });

  if (attended.length > 0) {
    lines.push(
      '*ATTENDED — PATIENT NOT IN THE WARD*',
      '',
      'These are not defaults. An anaesthetist went to the ward and the patient '
      + 'was not in it, which is a finding against the list rather than against '
      + 'the department. The surgical teams have already been written to.',
      '',
    );
    attended.forEach((c, i) => {
      const who = c.patientName?.trim() || 'Patient not named';
      lines.push(
        `${i + 1}. ${who} — ${c.procedureName}`
        + (c.patientAbsentByName?.trim() ? `. Recorded by ${c.patientAbsentByName.trim()}` : '')
        + (c.patientAbsentReason?.trim() ? `: ${c.patientAbsentReason.trim()}` : '.'),
      );
    });
    lines.push('');
  }

  lines.push(
    '*WHERE THIS STANDS UNDER THE CURRENT POLICY*',
    '',
    `• The hand-back window closed at ${handbackBy}. An anaesthetist who cannot `
    + 'review a case is required to say so before then, so that somebody else can '
    + 'be named while there is still an evening to do it in.',
    `• The review itself is due by ${reviewBy}. A case still unreviewed after that `
    + 'is recorded against the person named to it, by name and by time, and that '
    + 'record is what the morning meeting reads.',
    '• A case that reaches the morning unreviewed has not been assessed for '
    + 'anaesthetic fitness by anybody. It cannot be certified fit at the door, and '
    + 'the decision then falls to whoever is standing in theatre with the list '
    + 'already running.',
    '',
    '*AND IT DOES NOT STOP AT ANAESTHESIA*',
    '',
    'Management has banned paper prescriptions. Consumables and medicines for a '
    + 'case are prescribed and dispensed through this platform ONLY, and issuing a '
    + 'handwritten drug or consumable list is a policy violation.',
    '',
    'The anaesthetic review is where a case’s anaesthetic drugs and consumables '
    + 'enter the system. Until it is done:',
    '',
    '• the theatre pharmacy has nothing to dispense against;',
    '• the consumable pack provider has nothing to pack;',
    '• the patient cannot be told what to pay for, so nothing is paid;',
    '• and none of it can be put right with a piece of paper on the morning, '
    + 'because paper is no longer permitted.',
    '',
    'So an unreviewed case does not merely lack a review. It arrives with no pack, '
    + 'and the earliest anybody can begin is the morning of surgery — which is '
    + 'the hour the ban on paper prescriptions was brought in to stop us working in.',
    '',
    '*WHAT IS ASKED*',
    '',
    `Please name or reassign a reviewer for each case above. The board is at `
    + '/dashboard/preop-reviews/watch and the reassignment can be done on it.',
    '',
  );

  const role = input.senderRole?.trim() || 'Theatre Management';
  if (input.senderName?.trim()) lines.push(`— ${input.senderName.trim()}, ${role}`);
  else lines.push(`— ${role}`);
  lines.push('UNTH Ituku-Ozalla Theatre Complex');

  return lines.join('\n');
}

/**
 * The line the button shows, so nobody sends a briefing without knowing what
 * is in it.
 */
export function briefingSummary(cases: BriefCase[]): string {
  const { unreviewed, attended } = splitForBriefing(cases);
  if (unreviewed.length === 0 && attended.length === 0) {
    return 'Every case has a review.';
  }
  const bits: string[] = [];
  if (unreviewed.length > 0) {
    bits.push(`${unreviewed.length} case${unreviewed.length === 1 ? '' : 's'} with no review`);
  }
  if (attended.length > 0) {
    bits.push(`${attended.length} attended but the patient was not in the ward`);
  }
  const unnamed = unreviewed.filter((c) => responsibleFor(c).startsWith('NOBODY NAMED')).length;
  if (unnamed > 0) {
    bits.push(`${unnamed} with nobody named to review ${unnamed === 1 ? 'it' : 'them'}`);
  }
  return `${bits.join(', ')}.`;
}
