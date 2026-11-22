/**
 * Who was invited, and how far each of them got.
 *
 * This is the part of the record Management actually interrogates. "The
 * committee was consulted" is not a finding; "eleven heads of department were
 * invited, nine responded, and the two who did not are Anaesthesia and
 * Laboratory" is, and it changes what weight the recommendation carries. The
 * synthesis therefore carries the roster with it rather than leaving it on a
 * screen in the app that nobody reading the PDF can reach.
 *
 * WHY EVERY INVITEE IS LISTED, INCLUDING THE SILENT ONES. participationFor()
 * in owner.ts counts only live invitations (revokedAt: null) because it is
 * computing percentages. A roster that quietly dropped a withdrawn member, or
 * listed only those who answered, would be the single most misleading thing in
 * the document: it would make a review of four look like a review of four out
 * of four. Non-participation is a finding. So the roster lists everybody
 * invited and names the state of each, withdrawals included.
 *
 * ATTRIBUTION IS NOT DECIDED HERE. Each row arrives with its `contributor`
 * string already resolved by the caller through displayContributor(), so this
 * module cannot leak a name the round has not released — it never sees one.
 */

/** How far one invited member got. */
export type ParticipationLevel =
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'OPENED_ONLY'
  | 'NOT_OPENED'
  | 'WITHDRAWN';

export interface RosterInput {
  /** Already attribution-resolved: a name, a role, or "Withheld". */
  contributor: string;
  openedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  /** Sections this member gave a stance on. */
  answered: number;
  /** True when they came in through the group link rather than an invitation. */
  selfEnrolled?: boolean;
}

export interface RosterRow extends RosterInput {
  level: ParticipationLevel;
}

const isSet = (v: Date | string | null | undefined): boolean =>
  v !== null && v !== undefined && v !== '';

/**
 * The level, in precedence order.
 *
 * IN_PROGRESS is keyed off work done, not off `openedAt`. Opening a link and
 * closing it again is what almost everybody does first, and recording that as
 * participation would inflate the figure that matters most — a member who
 * tapped a link in WhatsApp has not reviewed a policy.
 */
export function participationLevel(row: {
  openedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  answered: number;
}): ParticipationLevel {
  if (isSet(row.revokedAt)) return 'WITHDRAWN';
  if (isSet(row.submittedAt)) return 'SUBMITTED';
  if (row.answered > 0) return 'IN_PROGRESS';
  if (isSet(row.openedAt)) return 'OPENED_ONLY';
  return 'NOT_OPENED';
}

export function levelLabel(level: ParticipationLevel): string {
  switch (level) {
    case 'SUBMITTED': return 'Submitted';
    case 'IN_PROGRESS': return 'Part-way through, not submitted';
    case 'OPENED_ONLY': return 'Opened the link, answered nothing';
    case 'NOT_OPENED': return 'Never opened the link';
    case 'WITHDRAWN': return 'Withdrawn';
    default: return 'Unknown';
  }
}

/** Only a submitted review counts as having taken part. */
export function countsAsParticipating(level: ParticipationLevel): boolean {
  return level === 'SUBMITTED';
}

export function withLevels(rows: RosterInput[]): RosterRow[] {
  return rows.map((r) => ({ ...r, level: participationLevel(r) }));
}

/**
 * Submitted first, then the part-finished, then the silent, withdrawals last.
 *
 * Not alphabetical. The document is read to find out who did not respond, and
 * that question should not require reading to the end of a table of eleven.
 */
const LEVEL_ORDER: ParticipationLevel[] = [
  'SUBMITTED', 'IN_PROGRESS', 'OPENED_ONLY', 'NOT_OPENED', 'WITHDRAWN',
];

export function sortRoster(rows: RosterRow[]): RosterRow[] {
  return [...rows].sort((a, b) => {
    const d = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
    if (d !== 0) return d;
    return a.contributor.localeCompare(b.contributor);
  });
}

export interface RosterSummary {
  invited: number;
  submitted: number;
  inProgress: number;
  openedOnly: number;
  notOpened: number;
  withdrawn: number;
  /** Of those not withdrawn. */
  responseRatePercent: number;
}

export function rosterSummary(rows: RosterRow[]): RosterSummary {
  const n = (l: ParticipationLevel) => rows.filter((r) => r.level === l).length;
  const withdrawn = n('WITHDRAWN');
  const submitted = n('SUBMITTED');
  // The rate is of those actually asked. Counting a withdrawn invitation in the
  // denominator reports a worse response than the committee achieved, and
  // counting it in the numerator reports a better one.
  const asked = rows.length - withdrawn;
  return {
    invited: rows.length,
    submitted,
    inProgress: n('IN_PROGRESS'),
    openedOnly: n('OPENED_ONLY'),
    notOpened: n('NOT_OPENED'),
    withdrawn,
    responseRatePercent: asked === 0 ? 0 : Math.round((submitted / asked) * 100),
  };
}

/** "9 of 11 invited members submitted (82%)." plus what happened to the rest. */
export function rosterSentence(s: RosterSummary): string {
  if (s.invited === 0) return 'Nobody was invited to this round.';

  const asked = s.invited - s.withdrawn;
  const parts = [
    `${s.submitted} of ${asked} invited member${asked === 1 ? '' : 's'} `
    + `submitted a review (${s.responseRatePercent}%).`,
  ];

  const rest: string[] = [];
  if (s.inProgress > 0) rest.push(`${s.inProgress} started but did not submit`);
  if (s.openedOnly > 0) rest.push(`${s.openedOnly} opened the link without answering`);
  if (s.notOpened > 0) rest.push(`${s.notOpened} never opened it`);
  if (rest.length > 0) parts.push(`Of the remainder, ${rest.join(', ')}.`);
  if (s.withdrawn > 0) {
    parts.push(`${s.withdrawn} invitation${s.withdrawn === 1 ? ' was' : 's were'} withdrawn `
      + 'and are excluded from the rate.');
  }
  return parts.join(' ');
}

const dayText = (v: Date | string | null | undefined): string => {
  if (!isSet(v)) return '—';
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return '—';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Composed from local parts, never toLocaleDateString: this machine and the
  // theatre server are both WAT, and a date that prints one way in the app and
  // another in the exported PDF is the thing a dispute over a late response
  // turns on.
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** "7 of 22" — blank for a withdrawal, where it would imply work that counts. */
export function answeredText(row: RosterRow, totalSections: number): string {
  if (row.level === 'WITHDRAWN') return '—';
  if (totalSections <= 0) return String(row.answered);
  return `${row.answered} of ${totalSections}`;
}

/**
 * The roster as a Markdown table, for the synthesis document.
 *
 * A table rather than prose because it is read to look somebody up. The pipes
 * in a contributor's name are escaped — a unit written "Theatre | Recovery"
 * would otherwise silently add a column and shift every cell after it.
 */
export function rosterMarkdown(rows: RosterRow[], totalSections: number): string {
  if (rows.length === 0) return '_Nobody was invited to this round._';

  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const out = [
    '| Member | Participation | Sections answered | Submitted |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of sortRoster(rows)) {
    out.push(
      `| ${esc(r.contributor)}${r.selfEnrolled ? ' _(joined via group link)_' : ''} `
      + `| ${levelLabel(r.level)} | ${answeredText(r, totalSections)} `
      + `| ${dayText(r.submittedAt)} |`,
    );
  }
  return out.join('\n');
}

/** The same rows as plain arrays, for the PDF's table and for CSV. */
export function rosterTableRows(
  rows: RosterRow[],
  totalSections: number,
): string[][] {
  return sortRoster(rows).map((r) => [
    r.contributor + (r.selfEnrolled ? ' (joined via group link)' : ''),
    levelLabel(r.level),
    answeredText(r, totalSections),
    dayText(r.submittedAt),
  ]);
}

export const ROSTER_COLUMNS = [
  'Member', 'Participation', 'Sections answered', 'Submitted',
] as const;
