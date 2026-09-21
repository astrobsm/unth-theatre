// ============================================================
// Turning a morning of argument into a sequence somebody can act on
// ------------------------------------------------------------
// A theatre conference produces twenty decisions in the order the points
// happened to be raised, which is almost never the order they can be done in.
// One of them needs a theatre closed for a week; two others cannot start until
// that is finished; a fourth was adopted on Tuesday and quietly contradicts a
// deferral taken on the same morning. Nobody in the room can hold all of that,
// and by the time it is written up the recollection has gone.
//
// This reads every point and every decision and works out the order, the gaps
// and the contradictions.
//
// WHAT IT WILL NOT DO, AND MUST NEVER DO: decide anything. It does not weigh
// arguments, it does not pick between proposals, and it does not write
// decisions the committee did not take. Every line it emits traces back to
// something a named person recorded in the room. A governance record produced
// by a machine that reasoned on its own behalf would be worthless at exactly
// the moment anybody needed to rely on it — which is when it is challenged.
//
// So it is deterministic and it is explainable: the same conference produces
// the same resolution, every time, and every finding names the points it came
// from. That is also why this is arithmetic and graph-walking rather than a
// language model — an analysis nobody can check is not an audit document, and
// the theatre server is expected to work with the internet down.
// ============================================================

export type ConferenceOutcome =
  | 'ADOPTED'
  | 'ADOPTED_WITH_MODIFICATION'
  | 'REJECTED'
  | 'DEFERRED'
  | 'REFERRED'
  | 'NOTED';

export type ConferenceArea =
  | 'LIST_AND_SCHEDULING' | 'STAFFING_AND_ROLES' | 'THEATRE_READINESS'
  | 'EMERGENCY_PATHWAY' | 'EQUIPMENT_AND_CONSUMABLES' | 'COMMUNICATION'
  | 'PATIENT_FLOW' | 'RECORDS_AND_AUDIT' | 'INFRASTRUCTURE' | 'TRAINING'
  | 'OTHER';

export const AREA_LABEL: Record<ConferenceArea, string> = {
  LIST_AND_SCHEDULING: 'Lists and scheduling',
  STAFFING_AND_ROLES: 'Staffing and roles',
  THEATRE_READINESS: 'Theatre readiness',
  EMERGENCY_PATHWAY: 'Emergency pathway',
  EQUIPMENT_AND_CONSUMABLES: 'Equipment and consumables',
  COMMUNICATION: 'Communication',
  PATIENT_FLOW: 'Patient flow',
  RECORDS_AND_AUDIT: 'Records and audit',
  INFRASTRUCTURE: 'Infrastructure',
  TRAINING: 'Training',
  OTHER: 'Other',
};

export const OUTCOME_LABEL: Record<ConferenceOutcome, string> = {
  ADOPTED: 'Adopted',
  ADOPTED_WITH_MODIFICATION: 'Adopted with modification',
  REJECTED: 'Not adopted',
  DEFERRED: 'Deferred',
  REFERRED: 'Referred',
  NOTED: 'Noted, no action',
};

/** Outcomes that commit somebody to doing something. */
export const ACTIONABLE: ConferenceOutcome[] = ['ADOPTED', 'ADOPTED_WITH_MODIFICATION'];

export const isActionable = (o: ConferenceOutcome | null | undefined): boolean =>
  !!o && ACTIONABLE.includes(o);

export interface IssueInput {
  id: string;
  ordinal: number;
  title: string;
  area: ConferenceArea | string;
  proposal?: string | null;
  decision?: DecisionInput | null;
}

export interface DecisionInput {
  outcome: ConferenceOutcome | string;
  decisionText: string;
  rationale?: string | null;
  ownerName?: string | null;
  dueDate?: string | Date | null;
  dependsOnIssueIds?: string[] | null;
  resourceImplication?: string | null;
  reviewOn?: string | Date | null;
  referredTo?: string | null;
  votesFor?: number | null;
  votesAgainst?: number | null;
  votesAbstain?: number | null;
}

/** Severity of a finding. `blocking` stops the resolution being adopted. */
export type FindingLevel = 'blocking' | 'advisory';

export interface Finding {
  level: FindingLevel;
  code: string;
  /** What is wrong, in one sentence, naming the points it concerns. */
  message: string;
  /** Agenda numbers involved, so the chair can turn straight to them. */
  ordinals: number[];
}

const asDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ref = (i: IssueInput) => `point ${i.ordinal}`;
const refList = (items: IssueInput[]) =>
  items.map((i) => String(i.ordinal)).join(', ');

/**
 * What is missing or self-contradictory.
 *
 * Ordered so the chair reads the things that stop adoption first. Each one
 * names its points: "3 decisions have no owner" sends somebody hunting through
 * twenty pages, "points 4, 9 and 12 have no owner" does not.
 */
export function findGaps(issues: IssueInput[]): Finding[] {
  const found: Finding[] = [];
  const byId = new Map(issues.map((i) => [i.id, i]));

  // ── Points never decided ────────────────────────────────────────────────
  const undecided = issues.filter((i) => !i.decision);
  if (undecided.length) {
    found.push({
      level: 'blocking',
      code: 'NO_DECISION',
      message: undecided.length === 1
        ? `Point ${undecided[0].ordinal} was raised but no decision is recorded against it.`
        : `Points ${refList(undecided)} were raised but no decision is recorded against them.`,
      ordinals: undecided.map((i) => i.ordinal),
    });
  }

  const decided = issues.filter((i) => i.decision);
  const actionable = decided.filter((i) => isActionable(i.decision!.outcome as ConferenceOutcome));

  // ── Adopted, but nobody is doing it ─────────────────────────────────────
  const ownerless = actionable.filter((i) => !(i.decision!.ownerName ?? '').trim());
  if (ownerless.length) {
    found.push({
      level: 'blocking',
      code: 'NO_OWNER',
      // An adopted decision with nobody's name against it is the single most
      // reliable way for a conference to change nothing at all.
      message: `Adopted at ${ownerless.length === 1 ? 'point' : 'points'} ${refList(ownerless)}, with nobody named to carry it out.`,
      ordinals: ownerless.map((i) => i.ordinal),
    });
  }

  // ── Adopted, but no date ────────────────────────────────────────────────
  const undated = actionable.filter((i) => !asDate(i.decision!.dueDate));
  if (undated.length) {
    found.push({
      level: 'advisory',
      code: 'NO_DUE_DATE',
      message: `No date is set for ${undated.length === 1 ? 'point' : 'points'} ${refList(undated)}. Without one there is nothing to review against at the next sitting.`,
      ordinals: undated.map((i) => i.ordinal),
    });
  }

  // ── Deferred into nowhere ───────────────────────────────────────────────
  const driftingDeferrals = decided.filter(
    (i) => i.decision!.outcome === 'DEFERRED' && !asDate(i.decision!.reviewOn),
  );
  if (driftingDeferrals.length) {
    found.push({
      level: 'advisory',
      code: 'DEFERRED_NO_RETURN',
      // This is how a point disappears: deferred once, never re-tabled, and
      // nobody can say whose job it was to bring it back.
      message: `Deferred with no return date at ${driftingDeferrals.length === 1 ? 'point' : 'points'} ${refList(driftingDeferrals)}. A deferral without a date is how a point is lost.`,
      ordinals: driftingDeferrals.map((i) => i.ordinal),
    });
  }

  // ── Referred to nobody in particular ────────────────────────────────────
  const vagueReferrals = decided.filter(
    (i) => i.decision!.outcome === 'REFERRED' && !(i.decision!.referredTo ?? '').trim(),
  );
  if (vagueReferrals.length) {
    found.push({
      level: 'advisory',
      code: 'REFERRED_TO_NOBODY',
      message: `Referred without saying to whom at ${vagueReferrals.length === 1 ? 'point' : 'points'} ${refList(vagueReferrals)}.`,
      ordinals: vagueReferrals.map((i) => i.ordinal),
    });
  }

  // ── "Adopted with modification" that does not say what changed ──────────
  const unmodified = decided.filter(
    (i) => i.decision!.outcome === 'ADOPTED_WITH_MODIFICATION'
      && i.decision!.decisionText.trim().length < 15,
  );
  if (unmodified.length) {
    found.push({
      level: 'blocking',
      code: 'MODIFICATION_NOT_STATED',
      // The modification IS the decision. Without it the minute records that
      // the proposal was changed into something unknown.
      message: `Adopted with modification at ${refList(unmodified)}, but the modification is not written down. What was changed is the decision.`,
      ordinals: unmodified.map((i) => i.ordinal),
    });
  }

  // ── Depending on something that is not happening ────────────────────────
  const brokenDeps: Finding[] = [];
  actionable.forEach((i) => {
    (i.decision!.dependsOnIssueIds ?? []).forEach((depId) => {
      const dep = byId.get(depId);
      if (!dep) {
        brokenDeps.push({
          level: 'advisory',
          code: 'DEPENDS_ON_UNKNOWN',
          message: `${cap(ref(i))} depends on a point that is not on this agenda.`,
          ordinals: [i.ordinal],
        });
        return;
      }
      if (!dep.decision) {
        brokenDeps.push({
          level: 'blocking',
          code: 'DEPENDS_ON_UNDECIDED',
          message: `${cap(ref(i))} was adopted but depends on point ${dep.ordinal}, which has no decision.`,
          ordinals: [i.ordinal, dep.ordinal],
        });
        return;
      }
      if (!isActionable(dep.decision.outcome as ConferenceOutcome)) {
        brokenDeps.push({
          level: 'blocking',
          code: 'DEPENDS_ON_NOT_ADOPTED',
          // The clearest contradiction a conference can produce, and the one
          // most easily missed in the room: A was adopted on the strength of B,
          // and B was then turned down an hour later.
          message: `${cap(ref(i))} was adopted but depends on point ${dep.ordinal}, which was ${OUTCOME_LABEL[dep.decision.outcome as ConferenceOutcome].toLowerCase()}. One of the two has to change.`,
          ordinals: [i.ordinal, dep.ordinal],
        });
      }
    });
  });
  found.push(...brokenDeps);

  // ── Due before the thing it waits on ────────────────────────────────────
  actionable.forEach((i) => {
    const mine = asDate(i.decision!.dueDate);
    if (!mine) return;
    (i.decision!.dependsOnIssueIds ?? []).forEach((depId) => {
      const dep = byId.get(depId);
      const theirs = asDate(dep?.decision?.dueDate);
      if (dep && theirs && mine < theirs) {
        found.push({
          level: 'advisory',
          code: 'DUE_BEFORE_PREREQUISITE',
          message: `${cap(ref(i))} is due before point ${dep.ordinal}, which it depends on.`,
          ordinals: [i.ordinal, dep.ordinal],
        });
      }
    });
  });

  // ── One person carrying the whole conference ────────────────────────────
  const byOwner = new Map<string, IssueInput[]>();
  actionable.forEach((i) => {
    const owner = (i.decision!.ownerName ?? '').trim();
    if (!owner) return;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), i]);
  });
  Array.from(byOwner.entries()).forEach(([owner, theirs]) => {
    if (theirs.length >= 4) {
      found.push({
        level: 'advisory',
        code: 'OWNER_OVERLOADED',
        // Not a rule, an observation. Four actions on one person out of a
        // single sitting is usually a conference that agreed easily because
        // one person kept saying yes.
        message: `${owner} is named on ${theirs.length} of the adopted points (${refList(theirs)}). Worth checking that is deliverable.`,
        ordinals: theirs.map((i) => i.ordinal),
      });
    }
  });

  // Blocking first; within a level, by the earliest point concerned, so the
  // chair can work down the agenda rather than jumping about.
  return found.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'blocking' ? -1 : 1;
    return Math.min(...a.ordinals) - Math.min(...b.ordinals);
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface SequencedStep {
  issue: IssueInput;
  /** 1 = nothing to wait for. Everything in a phase can start together. */
  phase: number;
  /** Agenda numbers this one waits on. */
  after: number[];
}

export interface SequenceResult {
  steps: SequencedStep[];
  /** Points caught in a dependency loop. None of them can ever start. */
  circular: IssueInput[];
}

/**
 * The order the adopted decisions can actually be done in.
 *
 * A topological sort over the declared dependencies, in phases: everything in
 * phase 1 can begin at once, phase 2 waits on phase 1, and so on. Within a
 * phase the agenda order is kept, because that is the order the room discussed
 * them and it makes the resolution readable against the minute.
 *
 * Only adopted decisions are sequenced. A rejected point has no implementation
 * to order, and putting it in the sequence for completeness would produce a
 * plan containing things nobody agreed to do.
 *
 * A dependency loop is reported rather than broken. Choosing which of three
 * mutually-blocking decisions goes first is a decision, and this does not make
 * those.
 */
export function sequence(issues: IssueInput[]): SequenceResult {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const actionable = issues
    .filter((i) => i.decision && isActionable(i.decision.outcome as ConferenceOutcome))
    .sort((a, b) => a.ordinal - b.ordinal);

  const inPlan = new Set(actionable.map((i) => i.id));

  // Only dependencies that are themselves in the plan constrain it. Waiting on
  // a point that was rejected is already reported as a contradiction by
  // findGaps; it must not also silently hold the whole sequence hostage.
  const deps = new Map<string, string[]>();
  actionable.forEach((i) => {
    deps.set(i.id, (i.decision!.dependsOnIssueIds ?? []).filter((d) => inPlan.has(d)));
  });

  const phaseOf = new Map<string, number>();
  const steps: SequencedStep[] = [];
  let remaining = actionable.slice();
  let phase = 1;

  while (remaining.length) {
    const ready = remaining.filter((i) =>
      (deps.get(i.id) ?? []).every((d) => phaseOf.has(d)));

    // Nothing can start: everything left is waiting on everything else.
    if (!ready.length) break;

    ready.forEach((i) => {
      phaseOf.set(i.id, phase);
      steps.push({
        issue: i,
        phase,
        after: (deps.get(i.id) ?? [])
          .map((d) => byId.get(d)?.ordinal)
          .filter((n): n is number => typeof n === 'number')
          .sort((a, b) => a - b),
      });
    });

    remaining = remaining.filter((i) => !phaseOf.has(i.id));
    phase += 1;
  }

  return { steps, circular: remaining };
}

export interface ConferenceAnalysis {
  findings: Finding[];
  blocking: Finding[];
  sequence: SequenceResult;
  counts: {
    points: number;
    decided: number;
    adopted: number;
    rejected: number;
    deferred: number;
    referred: number;
    noted: number;
    withOwner: number;
    withDate: number;
  };
  /** True when nothing blocking remains. Advisory findings never block. */
  readyToAdopt: boolean;
}

export function analyse(issues: IssueInput[]): ConferenceAnalysis {
  const ordered = issues.slice().sort((a, b) => a.ordinal - b.ordinal);
  const findings = findGaps(ordered);
  const seq = sequence(ordered);

  if (seq.circular.length) {
    findings.unshift({
      level: 'blocking',
      code: 'CIRCULAR_DEPENDENCY',
      message: `Points ${refList(seq.circular)} each wait on one another, so none of them can start. The conference has to say which goes first.`,
      ordinals: seq.circular.map((i) => i.ordinal),
    });
  }

  const outcome = (i: IssueInput) => i.decision?.outcome as ConferenceOutcome | undefined;
  const decided = ordered.filter((i) => i.decision);
  const adopted = decided.filter((i) => isActionable(outcome(i)));

  const blocking = findings.filter((f) => f.level === 'blocking');

  return {
    findings,
    blocking,
    sequence: seq,
    counts: {
      points: ordered.length,
      decided: decided.length,
      adopted: adopted.length,
      rejected: decided.filter((i) => outcome(i) === 'REJECTED').length,
      deferred: decided.filter((i) => outcome(i) === 'DEFERRED').length,
      referred: decided.filter((i) => outcome(i) === 'REFERRED').length,
      noted: decided.filter((i) => outcome(i) === 'NOTED').length,
      withOwner: adopted.filter((i) => (i.decision!.ownerName ?? '').trim()).length,
      withDate: adopted.filter((i) => asDate(i.decision!.dueDate)).length,
    },
    // An empty agenda is not ready to adopt. It would produce a resolution
    // resolving nothing, signed by the chair.
    readyToAdopt: ordered.length > 0 && blocking.length === 0,
  };
}

const fmtDate = (v: string | Date | null | undefined): string | null => {
  const d = asDate(v);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
};

/**
 * The resolution: the ultimate decisions, in the order they can be carried out.
 *
 * Plain text, because it has to survive being pasted into an email, printed,
 * and read aloud. Every line restates something recorded in the room — the
 * only thing added is the ordering.
 */
export function buildResolution(input: {
  title: string;
  sittingDate: string | Date;
  venue?: string | null;
  chairName: string;
  issues: IssueInput[];
}): string {
  const analysis = analyse(input.issues);
  const ordered = input.issues.slice().sort((a, b) => a.ordinal - b.ordinal);
  const out: string[] = [];

  out.push(input.title.toUpperCase());
  out.push(`Sitting of ${fmtDate(input.sittingDate) ?? 'unknown date'}${input.venue ? `, ${input.venue}` : ''}`);
  out.push(`Chair: ${input.chairName}`);
  out.push('');
  out.push('RESOLUTION');
  out.push('');

  const { steps, circular } = analysis.sequence;

  if (!steps.length) {
    out.push('No decision at this sitting commits the department to an action.');
  } else {
    const phases = Array.from(new Set(steps.map((s) => s.phase))).sort((a, b) => a - b);
    let n = 0;
    phases.forEach((ph) => {
      const inPhase = steps.filter((s) => s.phase === ph);
      out.push(phases.length > 1
        ? `Stage ${ph} — ${ph === 1 ? 'may begin immediately' : `begins once stage ${ph - 1} is complete`}`
        : 'Agreed actions');
      out.push('');
      inPhase.forEach((s) => {
        n += 1;
        const d = s.issue.decision!;
        out.push(`${n}. ${d.decisionText.trim()}`);
        const meta: string[] = [`raised as point ${s.issue.ordinal}`];
        if (d.ownerName) meta.push(`responsible: ${d.ownerName}`);
        const due = fmtDate(d.dueDate);
        if (due) meta.push(`by ${due}`);
        if (s.after.length) meta.push(`follows point${s.after.length > 1 ? 's' : ''} ${s.after.join(', ')}`);
        out.push(`   (${meta.join('; ')})`);
        if (d.resourceImplication?.trim()) {
          out.push(`   Requires: ${d.resourceImplication.trim()}`);
        }
        out.push('');
      });
    });
  }

  // Everything the conference decided NOT to do, or not to do yet. Left out of
  // a resolution, these come back as the same proposal at the next sitting
  // with nobody able to say it was already considered.
  const others = ordered.filter(
    (i) => i.decision && !isActionable(i.decision.outcome as ConferenceOutcome),
  );
  if (others.length) {
    out.push('ALSO RESOLVED');
    out.push('');
    others.forEach((i) => {
      const d = i.decision!;
      const label = OUTCOME_LABEL[d.outcome as ConferenceOutcome];
      const extra: string[] = [];
      const review = fmtDate(d.reviewOn);
      if (review) extra.push(`to return on ${review}`);
      if (d.referredTo?.trim()) extra.push(`referred to ${d.referredTo.trim()}`);
      out.push(`Point ${i.ordinal} — ${i.title}: ${label}.${extra.length ? ` (${extra.join('; ')})` : ''}`);
      if (d.decisionText.trim()) out.push(`   ${d.decisionText.trim()}`);
      if (d.rationale?.trim()) out.push(`   Reason: ${d.rationale.trim()}`);
      out.push('');
    });
  }

  if (circular.length) {
    out.push('NOT SEQUENCED');
    out.push('');
    out.push(
      `Points ${refList(circular)} each depend on one another and cannot be ordered. `
      + 'The conference must say which of them goes first.',
    );
    out.push('');
  }

  const undecided = ordered.filter((i) => !i.decision);
  if (undecided.length) {
    out.push('CARRIED FORWARD');
    out.push('');
    undecided.forEach((i) => out.push(`Point ${i.ordinal} — ${i.title}: no decision taken.`));
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The agenda: the structural adjustments actually on the table.
 *
 * NOT a list of generic headings. These are the changes that have been put to
 * the department over the past weeks — most of them already built and running,
 * because they were asked for and delivered before anybody sat down to ratify
 * them. That is precisely why the conference is being held, and it is why each
 * point says plainly whether it is already in use.
 *
 * A committee asked to ratify something already running needs three things in
 * front of it that a normal agenda does not carry: that it IS running, since
 * when, and what reversing it would now cost. All three are in the background
 * of every point below.
 *
 * Every heading can be renamed, reordered or deleted, and points of the
 * committee's own can be added. What none of them carries is a DECISION: the
 * proposal is stated because it is genuinely what was proposed, and the column
 * beside it is empty until somebody in the room fills it in.
 */
export const AGENDA_TEMPLATE: Array<{
  title: string;
  area: ConferenceArea;
  background: string;
  currentPractice: string;
  proposal: string;
}> = [
  {
    title: 'Booking is departmental clerical work, not the resident\u2019s',
    area: 'STAFFING_AND_ROLES',
    background:
      'Raised by the surgical residents on 21 August: booking that departmental staff used to do had '
      + 'quietly transferred to them, along with specifying consumables, the anaesthetic assessment, '
      + 'ward height and weight, and typing in laboratory results. The figures agreed with them \u2014 against '
      + '563 cases in two months the anaesthetists recorded 3 reviews, while ASA was entered 448 times by '
      + 'whoever registered the patient. A BOOKING_OFFICER role now exists in the system; no one has been '
      + 'appointed to it.',
    currentPractice:
      'Surgical residents book the cases for their units and enter the pre-operative data, whoever '
      + 'actually holds the information.',
    proposal:
      'Each unit names a booking officer who enters its bookings. The anaesthetic assessment is entered '
      + 'by an anaesthetist and by nobody else.',
  },
  {
    title: 'A refused booking offers the ways out of the clash',
    area: 'LIST_AND_SCHEDULING',
    background:
      'ALREADY IN USE. A booking that clashed was refused with a message and no route forward, so the '
      + 'case was settled by telephone or not at all. Built and deployed; the conference is asked to '
      + 'ratify, amend or reverse it.',
    currentPractice:
      'The booking is refused. The user either rings the theatre or abandons the case.',
    proposal:
      'The refusal opens the theatre\u2019s whole list for that day and offers what can actually be done: '
      + 'take the suggested time, fill a gap, insert and push the later cases, move to another theatre, '
      + 'shorten the case, or take another day. Cases already in the holding area, ready for theatre or '
      + 'in progress cannot be moved.',
  },
  {
    title: 'Every refusal in the system explains itself and offers a way out',
    area: 'COMMUNICATION',
    background:
      'ALREADY IN USE, deployed 19 September. A refusal used to end at a red line of text \u2014 "Validation '
      + 'failed" at the top of a form several screens long, "Unauthorized" where a session had expired. '
      + 'True, and useless to the person in front of the screen.',
    currentPractice:
      'Each of roughly 150 forms reports its own refusals however it happens to.',
    proposal:
      'Any refused submission raises a dialog giving the reason in one sentence, the specific fields at '
      + 'fault, and buttons that go to the screen where it is solved. Screens that already handle a '
      + 'refusal properly are left alone.',
  },
  {
    title: 'Theatre readiness is confirmed by tick-list, separately by the scrub nurse and the technician',
    area: 'THEATRE_READINESS',
    background:
      'ALREADY IN USE, deployed 19 September. Readiness was a field on the material-collection record, so '
      + 'a nurse standing in a fully prepared theatre could not say so until somebody had first entered a '
      + 'stores document. The theatre technician had no way to answer at all.',
    currentPractice:
      'One nurse ticks three boxes against a collection record, if one exists. The anaesthetic machine, '
      + 'the gases, the monitors and the airway are not asked about by anybody.',
    proposal:
      'Two lists, one each for the scrub nurse and the theatre technician, independent of any stores '
      + 'record. A theatre counts as ready only when both have confirmed, and the radio announces it '
      + 'three times, naming who confirmed it. Anything short or faulty is read out with the announcement.',
  },
  {
    title: 'Each team member states whether they are coming to the case',
    area: 'STAFFING_AND_ROLES',
    background:
      'ALREADY IN USE, deployed 19 September. Whether the anaesthetist was coming was established by '
      + 'telephone on the morning of the list, one call at a time, usually by whoever was already standing '
      + 'in the theatre \u2014 so the whole cost of an unanswered phone fell on the person least able to do '
      + 'anything about it.',
    currentPractice:
      'Availability is established by telephone, case by case, on the morning.',
    proposal:
      'Each member answers once on their own dashboard \u2014 available, delayed with an estimate, or not '
      + 'available \u2014 and everyone on that case sees every answer. Elective and emergency alike. No answer '
      + 'is recorded as "not yet said" and never as a refusal.',
  },
  {
    title: 'A daily theatre-status board for the Chief Medical Director',
    area: 'COMMUNICATION',
    background:
      'ALREADY IN USE, deployed 19 September. A question about this morning took six telephone calls, and '
      + 'by the time it was answered the morning was over.',
    currentPractice:
      'The executive establishes the state of the theatre by ringing round.',
    proposal:
      'One screen: theatres ready and who confirmed them, cases booked, who on each team has said they '
      + 'are coming. Two actions \u2014 ask what is needed, or say thank you \u2014 both opening WhatsApp with the '
      + 'message drafted for the CMD to read and send. Nothing is sent automatically. It is the only '
      + 'screen carrying staff telephone numbers and is restricted to the executive and theatre management.',
  },
  {
    title: 'The holding area ceases to be listed as a theatre',
    area: 'PATIENT_FLOW',
    background:
      'ALREADY IN USE, deployed 19 September. The holding area was entered in the theatre register as '
      + 'though it were a theatre, so it appeared in every theatre picker and a case could be booked into '
      + 'it. Two cases still point at it \u2014 one scheduled 8 September, one recorded as in progress since '
      + '10 July \u2014 and 15 past allocations. Neither case was moved by the change: reassigning a patient\u2019s '
      + 'theatre is a decision for this committee, not for a script.',
    currentPractice:
      'The holding area sits among the operating theatres in the register, and staff assigned to it are '
      + 'recorded nowhere.',
    proposal:
      'It is flagged as not an operating room \u2014 kept, because transfers and patient movements point at it, '
      + 'but no longer offered anywhere a case can be booked or a list allocated. Staff are named to it by '
      + 'shift through the Nurses Board, with the record showing who allocated them. The committee is also '
      + 'asked to direct what happens to the two cases still booked into it.',
  },
  {
    title: 'Registration warns before a second record is created for the same patient',
    area: 'RECORDS_AND_AUDIT',
    background:
      'ALREADY IN USE. Thirty-seven duplicate patient pairs were found in the register, and a surgeon '
      + 'reported "patient not found" at booking immediately after registering the patient. The thirty-seven '
      + 'pairs have still not been reviewed clinically, and 33 bookings share a surgery id.',
    currentPractice:
      'A second record is created silently whenever the name or folder number is typed differently.',
    proposal:
      'Registration checks the folder number and the name against the register and holds a near-match, '
      + 'showing what it found. The clerk may override, and the override is recorded against their name. '
      + 'The committee is asked to direct who reviews the 37 existing pairs and the 33 shared bookings, '
      + 'and by when.',
  },
  {
    title: 'Post-operative notes become structured and procedure-aware',
    area: 'RECORDS_AND_AUDIT',
    background:
      'ALREADY IN USE. Notes were free text, so nothing could be counted across cases and any research '
      + 'question required reading charts one by one. Existing free-text notes were preserved and remain '
      + 'readable alongside the structured ones.',
    currentPractice:
      'A free-text note per case, in whatever form the writer chooses.',
    proposal:
      'A structured note with core sections and per-procedure templates, the intra-operative findings '
      + 'deliberately left as free text. Variables are stored separately so the department can count them. '
      + 'Templates can be added without a database change.',
  },
  {
    title: 'The duplicate Eye Theatre record, and who may create a theatre',
    area: 'INFRASTRUCTURE',
    background:
      'The Eye Theatre existed twice in the register, created in February and May, with its bookings split '
      + 'across both \u2014 114 references on one and 7 on the other \u2014 so neither told the whole truth about any '
      + 'day. Merged on 21 September onto the record holding the 71 surgeries and 34 roster lines, with the '
      + 'seven references moved across and the duplicate removed. The committee is asked to ratify the '
      + 'merge and to close the gap that produced it.',
    currentPractice:
      'Any administrator can add a theatre, and nothing detects a duplicate.',
    proposal:
      'Ratify the merge. Agree who may create a theatre record, and that the location wording is settled '
      + 'by theatre management rather than by whoever types it first.',
  },
  {
    title: 'Hospital-wide awareness training, by role',
    area: 'TRAINING',
    background:
      'Seven presentations were produced covering captive-portal login, the emergency and elective booking '
      + 'flows, anaesthesia review, pharmacy packing, consumable packs and staff availability \u2014 each slide '
      + 'a screenshot of the actual page with the notes beside it. Nothing has been scheduled.',
    currentPractice:
      'Staff learn the system from each other, unevenly.',
    proposal:
      'The committee sets who must attend which presentation, when, and what happens for a member of '
      + 'staff who has not been through the one covering their own module.',
  },
  {
    title: 'Rebuilding the database from nothing, and the backup drill',
    area: 'INFRASTRUCTURE',
    background:
      'A real and unresolved risk, reported and not yet fixed: the migration history cannot rebuild the '
      + 'database from empty \u2014 it stops partway with a missing type. Both live databases are fine, because '
      + 'they were built up migration by migration. It means that if a database had to be recreated from '
      + 'the repository it could not be, and nobody has tested a restore.',
    currentPractice:
      'Backups exist. No restore has been attempted, and a rebuild from the migration history is known to '
      + 'fail.',
    proposal:
      'Name somebody to own it, fix the migration history so a rebuild from empty succeeds, and carry out '
      + 'a restore drill onto a spare machine with a date set for it.',
  },
  {
    title: 'Outstanding configuration the department has to settle',
    area: 'RECORDS_AND_AUDIT',
    background:
      'Carried over and repeatedly reported: the WhatsApp credentials template is unset, and the '
      + 'radiologist, radiographer and infection-control nurse roles exist in the system with nobody '
      + 'assigned to them.',
    currentPractice:
      'The roles are unassigned and the messaging template unset, so the features behind them are dormant.',
    proposal:
      'Names against each role, and a decision on the messaging template, with an owner and a date.',
  },
];
