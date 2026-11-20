/**
 * What theatre says back to the oxygen room, and what the oxygen room says back.
 *
 * Today the traffic runs one way. The oxygen room files a readiness report and
 * the theatre reads it, hours later, with no way to answer. So when an
 * anaesthetic technician setting up Theatre 2 sees a posted pressure that does
 * not match the gauge on the wall in front of him, his options are to telephone
 * somebody whose number he does not have, or to write nothing and get on with
 * it. The second is what happens.
 *
 * This is the reply channel, and it is deliberately narrow. Three things a
 * technician can say and three the oxygen room can answer, because a free-text
 * thread between two rooms that cannot see each other turns into a chat nobody
 * reads, and the one message that mattered is on page two.
 */

export type OxygenCommentKind =
  /** "I am setting up — is this status still good?" */
  | 'CONFIRM_REQUEST'
  /** "Change the cylinder / raise the pressure / Theatre 3 outlet is dead." */
  | 'ADJUSTMENT_REQUEST'
  /** A note for the record with nothing asked of anybody. */
  | 'OBSERVATION';

export const OXYGEN_COMMENT_KINDS: OxygenCommentKind[] = [
  'CONFIRM_REQUEST',
  'ADJUSTMENT_REQUEST',
  'OBSERVATION',
];

/** The kinds that are waiting on the oxygen room. An OBSERVATION is not. */
export const KINDS_NEEDING_ANSWER: OxygenCommentKind[] = [
  'CONFIRM_REQUEST',
  'ADJUSTMENT_REQUEST',
];

export type OxygenAnswerOutcome =
  /** The posted status stands as it is. */
  | 'CONFIRMED'
  /** Something was changed at the oxygen room's end. */
  | 'ADJUSTED'
  /** The oxygen room cannot do what was asked, and says why. */
  | 'DECLINED';

export const OXYGEN_ANSWER_OUTCOMES: OxygenAnswerOutcome[] = ['CONFIRMED', 'ADJUSTED', 'DECLINED'];

export type OxygenCommentStatus = 'OPEN' | 'ANSWERED';

export interface OxygenComment {
  id: string;
  reportId: string | null;
  /** When the report being commented on was filed. Denormalised: the comment
   *  has to be readable on the other node without a join that may not resolve. */
  reportedAt: string | Date | null;
  theatreName: string | null;
  kind: OxygenCommentKind | string;
  body: string | null;
  authorId: string | null;
  authorName: string;
  authorRole: string | null;
  status: OxygenCommentStatus | string;
  createdAt: string | Date;
  answeredAt: string | Date | null;
  answeredByName: string | null;
  answerOutcome: OxygenAnswerOutcome | string | null;
  answerBody: string | null;
}

/**
 * Long enough that "ok" and a stray keypress do not reach the oxygen room as a
 * request, short enough that "T2 outlet dead" gets through. Eight characters.
 */
export const OXYGEN_COMMENT_MIN_BODY = 8;

export function describeKind(kind: string): string {
  switch (kind) {
    case 'CONFIRM_REQUEST': return 'Asked the oxygen room to confirm the status still holds';
    case 'ADJUSTMENT_REQUEST': return 'Requested an adjustment';
    case 'OBSERVATION': return 'Observation from theatre';
    default: return 'Comment';
  }
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'CONFIRM_REQUEST': return 'Confirm status';
    case 'ADJUSTMENT_REQUEST': return 'Request adjustment';
    case 'OBSERVATION': return 'Observation';
    default: return 'Comment';
  }
}

export function outcomeLabel(outcome: string | null): string {
  switch (outcome) {
    case 'CONFIRMED': return 'Confirmed — status stands';
    case 'ADJUSTED': return 'Adjusted';
    case 'DECLINED': return 'Could not be done';
    default: return 'Answered';
  }
}

/**
 * Why an adjustment request must carry words and a confirmation need not.
 *
 * "Is this still right?" is complete on its own — the status it points at says
 * everything. "Please adjust it" is not: an oxygen room reading that has to
 * guess which theatre, which cylinder and how urgently, and a guess costs
 * another trip up the corridor.
 */
export function commentProblem(input: {
  kind: string;
  body?: string | null;
  theatreName?: string | null;
}): string | null {
  if (!OXYGEN_COMMENT_KINDS.includes(input.kind as OxygenCommentKind)) {
    return 'Choose what you are asking for.';
  }
  const body = (input.body ?? '').trim();
  if (input.kind === 'ADJUSTMENT_REQUEST' && body.length < OXYGEN_COMMENT_MIN_BODY) {
    return `Say what needs adjusting, in at least ${OXYGEN_COMMENT_MIN_BODY} characters — the oxygen room cannot act on a blank request.`;
  }
  if (input.kind === 'OBSERVATION' && body.length < OXYGEN_COMMENT_MIN_BODY) {
    return `Write the observation, in at least ${OXYGEN_COMMENT_MIN_BODY} characters.`;
  }
  return null;
}

export function answerProblem(input: {
  outcome: string;
  body?: string | null;
}): string | null {
  if (!OXYGEN_ANSWER_OUTCOMES.includes(input.outcome as OxygenAnswerOutcome)) {
    return 'Say whether the status stands, was adjusted, or could not be done.';
  }
  const body = (input.body ?? '').trim();
  // A plain confirmation speaks for itself. Declining does not: somebody in a
  // theatre is being told no, and has to decide what to do about it.
  if (input.outcome !== 'CONFIRMED' && body.length < OXYGEN_COMMENT_MIN_BODY) {
    return `Say what was done, or why it could not be — at least ${OXYGEN_COMMENT_MIN_BODY} characters.`;
  }
  return null;
}

export function needsAnswer(c: Pick<OxygenComment, 'kind' | 'status'>): boolean {
  return c.status === 'OPEN' && KINDS_NEEDING_ANSWER.includes(c.kind as OxygenCommentKind);
}

export function openComments(list: OxygenComment[]): OxygenComment[] {
  return list.filter(needsAnswer);
}

/** Newest first. The thread is read from the top on a phone. */
export function sortComments(list: OxygenComment[]): OxygenComment[] {
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * The message that goes to the oxygen room staff over WhatsApp.
 *
 * Written to be read on a locked screen: what, where, who, and the ask. A
 * number is never printed into it and no patient appears in it — an oxygen
 * pressure is plant, not a patient record.
 */
export function oxygenWhatsAppText(input: {
  kind: string;
  body?: string | null;
  theatreName?: string | null;
  authorName: string;
  authorRole?: string | null;
  statusLine?: string | null;
  url?: string | null;
}): string {
  const lines: string[] = ['🫁 UNTH Theatre — oxygen status'];
  lines.push(kindLabel(input.kind).toUpperCase());
  if (input.theatreName) lines.push(`Theatre: ${input.theatreName}`);
  if (input.statusLine) lines.push(`Posted status: ${input.statusLine}`);
  if (input.body && input.body.trim()) lines.push(`"${input.body.trim()}"`);
  lines.push(`— ${input.authorName}${input.authorRole ? `, ${input.authorRole.replace(/_/g, ' ').toLowerCase()}` : ''}`);
  if (input.url) lines.push(input.url);
  return lines.join('\n');
}
