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
  | 'INFECTION_PREVENTION' | 'DIAGNOSTIC_AND_SUPPORT' | 'FINANCE_AND_REVENUE'
  | 'ICT_AND_DOCUMENTATION' | 'GOVERNANCE'
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
  INFECTION_PREVENTION: 'Infection prevention and control',
  DIAGNOSTIC_AND_SUPPORT: 'Diagnostic and support services',
  FINANCE_AND_REVENUE: 'Finance and revenue',
  ICT_AND_DOCUMENTATION: 'ICT and documentation',
  GOVERNANCE: 'Governance and reporting',
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
 * The agenda: the Theatre Team's submission to the Chief Medical Director.
 *
 * Ref UNTH/THTR/TT/CMD/2026/09-02 of 8th September 2026, submitted jointly by
 * the Head, Theatre and the Theatre Manager, through the CMAC, following the
 * Panel of Inquiry into the stillbirth after a delayed emergency caesarean
 * section of 26th July 2026.
 *
 * EVERY ASK IN THE DOCUMENT IS A POINT, because the sitting takes them one
 * after another and anything not on the agenda is a decision the conference
 * never makes. So it is not only the eleven prayers. It is also the matters
 * the submission puts to Management elsewhere and which need a decision of
 * their own: the Legal Unit's confirmation before any policy is issued; the
 * costed attire schedule within fourteen days; the turnover standard; the
 * two-source appraisal instrument; the Appendix A recording table; the
 * decision-to-delivery interval; the Finance and Legal examination of
 * recovery; the ten monthly reports; the Appendix B establishment; the
 * undertakings given about the application; and the phasing itself.
 *
 * Where a prayer bundles asks the submission's own timetable separates, it is
 * split \u2014 prayer 8's direction on payment is immediate while its fund is at
 * ninety days, and a committee that cannot adopt one without the other is
 * being asked the wrong question.
 *
 * IN THE DOCUMENT'S ORDER. The preliminary first because prayer 8b turns on
 * it, then the prayers as numbered with their consequential points beside
 * them, then the appendices, then the phasing last \u2014 so the sitting settles
 * what it is doing before it settles when.
 *
 * Nothing is pre-decided and nothing is graded. The background is the
 * submission's own statement of the difficulty; the proposal is its own words,
 * compressed, with its lettering kept so a reader can turn to the paragraph.
 * Where it discloses that the application does NOT yet do something, or
 * declines to propose a figure, that is carried over \u2014 both were deliberate,
 * and a summary that loses them misrepresents what was asked for.
 */
export const PROPOSAL_REFERENCE = 'UNTH/THTR/TT/CMD/2026/09-02 of 8th September 2026';

export const AGENDA_TEMPLATE: Array<{
  title: string;
  area: ConferenceArea;
  background: string;
  currentPractice: string;
  proposal: string;
}> = [
  {
    title: 'Preliminary \u2014 Confirmation of the Legal Unit upon the matters of law before any policy is issued',
    area: 'GOVERNANCE',
    background:
      'Paragraph 2. The submission sets out the framework it is framed within \u2014 section 20(1) of the National Health Act 2014 (emergency treatment shall not be refused for any reason; contravention an offence); the Vulnerable Group Fund under the National Health Insurance Authority Act 2022; the MDCN Code of Medical Ethics; recognised perioperative and national IPC guidance on attire, decontamination and independent surveillance; and institutional liability, where harm follows an avoidable systems failure the exposure being principally the institution\u2019s rather than the individual clinician\u2019s. The Theatre Team states expressly that they are not counsel.',
    currentPractice:
      'Policy is issued without a settled legal opinion on these provisions, and the conflict between the Code and the institution\u2019s revenue procedure is left for individual clinicians to resolve at the bedside.',
    proposal:
      'That Management obtain the confirmation of the Hospital\u2019s Legal Unit upon the matters of law before any policy is issued, as the submission respectfully invites. This is taken first because prayer 8b turns upon it.',
  },
  {
    title: 'Prayer 1 \u2014 Permanent stationing of works/electrical and biomedical engineering staff in the Theatre Complex',
    area: 'INFRASTRUCTURE',
    background:
      'Paragraph 3. Faults are reported to units outside the complex and attended to according to those units\u2019 own priorities and travel. The gravest instance is a fault arising DURING an operation \u2014 lighting, diathermy, suction, the anaesthetic machine or monitor, air conditioning, power \u2014 when the patient is open on the table and the team can neither proceed safely nor stop; a response measured in tens of minutes is then not a service failure only but a clinical hazard. The application already carries the roles, fault reporting with acknowledgement and resolution timestamps, equipment checkout and status, fault alerts with severity and escalation to the Theatre Chairman, and daily utility readiness: the instrument to measure the standard exists, and what is sought is the posting of the personnel.',
    currentPractice:
      'Faults are reported outward to Works Services and Biomedical Engineering and attended to when those units can travel to the complex.',
    proposal:
      '(a) A works/electrical technician and a biomedical engineering technician permanently posted and physically stationed in the complex on every shift \u2014 morning, call and night \u2014 seven days a week. (b) A designated workspace, tool and spares store, and a minimum critical spares holding agreed with the Theatre Manager: lamps and assemblies, diathermy plates and leads, suction components, monitor cables and sensors, fuses and breakers, and anaesthetic machine consumables. (c) Professionally and administratively answerable to their parent departments, operationally answerable to the Theatre Manager for the duration of each shift. (d) Participation in the daily theatre readiness declaration before the list opens, certifying serviceability of theatre-critical plant. (e) A measured response standard: five minutes for a fault during an operation in progress, thirty minutes for all other theatre faults, every report, acknowledgement and resolution timed in the application. Sought IMMEDIATELY, by redeployment of existing establishment.',
  },
  {
    title: 'Prayer 2 \u2014 Institutional provision of theatre attire and footwear, and discontinuance of personal scrubs',
    area: 'INFECTION_PREVENTION',
    background:
      'Paragraph 4. Staff attend in scrubs brought from home and in personal footwear and enter the restricted zone in them \u2014 raised without imputation against the colleagues concerned, because the Hospital does not issue attire and a practitioner who must operate will find the attire he can. Domestically laundered attire cannot be validated as to temperature, detergent, cycle or segregation from household linen; footwear is in continuous contact with the floor of every area traversed; and the distinction between unrestricted, semi-restricted and restricted zones, on which the whole architecture of theatre infection control depends, cannot survive attire that crosses all three unchanged. The application already holds a complete scrub module \u2014 sets by serial, size and garment, role colour coding, per-person profiles including footwear size, daily issue and return against serials, laundry batches, overdue and non-return alerts, and a Scrub Care Provider role \u2014 and awaits only the stock.',
    currentPractice:
      'No attire is issued. Personal scrubs and personal footwear are worn from the residence, through public transport and the general areas of the Hospital, into the restricted zone.',
    proposal:
      '(a) Issue to every member of theatre staff without exception and without regard to rank \u2014 consultants, residents, house officers, nurses, anaesthetic technicians, environmental services staff, porters, students and all visiting or observing personnel. (b) Per person per session: scrub top, trousers and dedicated theatre footwear with head covering and mask, in sufficient sets for daily change and immediate change where attire is soiled during a list. (c) Colour-coded by role, so unauthorised presence in the restricted zone is apparent at a glance. (d) Laundered by the Hospital laundry to a defined standard in tracked batches, no attire leaving the complex. (e) The wearing of personal scrubs and footwear discontinued and change-room discipline enforced at the point of entry \u2014 the prohibition to FOLLOW provision and not precede it, since a rule staff cannot comply with produces evasion rather than compliance. (f) Issue and return recorded, so shortfall, loss and non-return are known quantities rather than a perpetual unattributable deficit.',
  },
  {
    title: 'Prayer 2, consequential \u2014 Costed attire schedule within fourteen days, and the laundry capacity it implies',
    area: 'FINANCE_AND_REVENUE',
    background:
      'Paragraph 4, resource implication. The submission identifies this as the proposal carrying the largest immediate procurement cost, and does not ask Management to approve a measure whose financial consequence has not been faced.',
    currentPractice:
      'No costed schedule exists, and the headcount of theatre staff by role and by size has not been taken.',
    proposal:
      'That the Theatre Manager be directed to submit, within FOURTEEN DAYS, a costed schedule based on an actual headcount of theatre staff by role and size, at an initial holding of three sets per person \u2014 one in use, one in laundry, one in reserve \u2014 together with the laundry capacity that holding implies. Phased issue by category, beginning with those working in the restricted zone, is put forward as achievable if a single procurement is not.',
  },
  {
    title: 'Prayer 3 \u2014 A dedicated environmental services team for the Theatre Complex',
    area: 'INFECTION_PREVENTION',
    background:
      'Paragraph 5. Cleaning is done in substantial part by staff shared with the general areas, deployed to theatre among other duties and trained to the standard of the general ward. Theatre cleaning is a distinct technical discipline \u2014 between-case turnover, terminal cleaning, periodic deep cleaning, blood and body-fluid spillage, clinical waste segregation, and zoning \u2014 each with a correct method, agent, dilution and contact time, and none of it intuitive. Where staff rotate from a general pool the training does not accumulate and the standard cannot be held. The consequence is felt twice: in infection, which appears late and is rarely traced back, and immediately \u2014 "theatre not ready or not cleaned" is one of the fifteen recorded reasons a case does not start, and turnover determines both how many cases a list completes and how long an emergency waits for a room. The application already carries a Cleaner role and a cleaning log with officer, theatre, type of clean, times, duration, verifier and quality rating.',
    currentPractice:
      'Theatre cleaning is done by a shared general pool, redeployable elsewhere, trained to ward standard, with no accumulated competence and no measured turnover interval.',
    proposal:
      '(a) A full complement permanently dedicated and posted to the complex and the emergency theatres on every shift, not shared with or redeployed to other areas. (b) One dedicated officer per active theatre per shift, plus staff for common areas, corridors, changing rooms, sluice and recovery, with a margin for relief, leave and absence. (c) Structured induction before deployment and routine refresher training, competence recorded against each individual, covering zoning and traffic control; colour-coded segregation of equipment between zones; selection, dilution, contact time and safe handling of agents; the between-case turnover procedure and the sequence of surfaces; terminal and deep cleaning; spillage management; waste segregation and transfer; PPE and hand hygiene; and recording their work in the application. (d) An adequate and uninterrupted supply of materials, agents and equipment within the complex \u2014 an empty cleaning store being among the commonest reasons a theatre is not turned over on time, and not a failing of the staff who find it empty. (e) Every cleaning episode recorded: theatre, type, officer, time commenced and completed. (g) Attire under prayer 2, colour-coded, and inclusion in the dedicated emergency teams so an emergency theatre is never awaiting a cleaner assigned elsewhere. (h) Professionally answerable to Environmental/Housekeeping Services, operationally to the Theatre Manager. Dedication and recording sought IMMEDIATELY by redeployment; training at THIRTY DAYS.',
  },
  {
    title: 'Prayer 3, consequential \u2014 Adoption of a standard between-case turnover interval, reported monthly',
    area: 'INFECTION_PREVENTION',
    background:
      'Paragraph 5(f). Turnover presently ceases to be an impression only once it is recorded; the submission asks separately that a standard be set against which the recorded figure is reported. It does not propose the interval itself.',
    currentPractice:
      'There is no adopted turnover standard, so recorded turnover times cannot be reported as compliance or shortfall.',
    proposal:
      'That a standard turnover interval be adopted, recommended jointly by the Theatre Manager and the infection prevention and control officer of prayer 4, and reported against monthly. Taken as its own point because it requires a recommendation from two named officers before Management can adopt it, and because one of those officers does not yet exist.',
  },
  {
    title: 'Prayer 4 \u2014 Dedicated infection prevention, control and quality assurance officers',
    area: 'INFECTION_PREVENTION',
    background:
      'Paragraph 6. IPC is exercised by a central unit covering the whole Hospital which attends theatre periodically. Quality assurance in theatre \u2014 checklist completion, the instrument and swab count, specimen handling and labelling, completeness of the operative record \u2014 is nobody\u2019s dedicated function. The standards at prayers 2 and 3 would therefore have no resident custodian, and a standard nobody is charged daily and on the ground with observing and recording is a standard in name only. Surgical site infection, the outcome measure connecting all of it, is not captured systematically against the case, so the Hospital cannot say whether its theatre practice is improving or deteriorating. DISCLOSED IN THE SUBMISSION: the application does NOT presently carry an IPC and quality assurance module, nor a role for such an officer, nor structured SSI surveillance.',
    currentPractice:
      'A central unit attends periodically. No resident custodian of theatre standards, and no systematic surveillance of surgical site infection against the case.',
    proposal:
      '(a) Officers fully dedicated to the complex and the emergency theatres, resident within them and not shared. (b) Functions comprising at least: daily environmental rounds against a written standard; SSI surveillance captured against the individual case and fed back to the surgical units; audit of WHO Surgical Safety Checklist completion at sign-in, time-out and sign-out; audit of attire, footwear and zoning; audit of cleaning and turnover records; audit of sterilisation, sterile stock rotation, pack integrity and the CSSD interface; audit of documentation completeness in the application; environmental and equipment sampling as directed; review of incidents and near misses with the Theatre Manager; and a monthly report to the Theatre Chairman, the IPC committee and Management. (c) Authority to require remediation where a standard is not met, and on defined infection-control grounds to escalate immediately to the Theatre Manager and Theatre Chairman for a decision on whether a theatre should be taken out of use \u2014 escalation rather than unilateral closure, so the clinical consequence of suspending a theatre is weighed by those answerable for it. (d) Professionally answerable to the IPC and quality directorates, operationally to the Theatre Manager. Sought at THIRTY DAYS.',
  },
  {
    title: 'Prayer 4, consequential \u2014 The two-source appraisal instrument for IPC and quality assurance officers',
    area: 'GOVERNANCE',
    background:
      'Paragraph 6 and Appendix C. The submission asks Management to adopt this expressly and not as a matter of form, giving its reason: a quality function appraised only by its parent directorate tends over time to report upwards rather than act locally, and its value becomes the submission of returns; appraised only by those whose work it audits it tends to be captured by them, and its findings soften. Drawing the appraisal from both is the safeguard against each.',
    currentPractice:
      'No appraisal instrument exists for such officers, the posts themselves not yet being established.',
    proposal:
      'That the appraisal be drawn one half from the documentation held in the application \u2014 audits completed against those scheduled, environmental round records, cleaning and turnover compliance, checklist completion rates, attire and zoning audits, sterilisation and pack integrity audits, documentation completeness, and SSI surveillance returns and trend \u2014 and one half from the assessment of the Heads of the Theatre Units: visibility and presence in the theatres, responsiveness to concerns raised, practical usefulness of findings, quality of feedback to units, contribution to incident review, and professional conduct. That neither source alone be determinative, and that material divergence be referred to the Theatre Chairman. Note that the first source depends on the module at the final point of this agenda, which does not yet exist.',
  },
  {
    title: 'Prayer 5 \u2014 All emergency cases at the Accident and Emergency Theatre, subject only to the recorded exceptions',
    area: 'EMERGENCY_PATHWAY',
    background:
      'Paragraph 7.1. The estate comprises the Professor Ojukwu Theatre Complex (Theatres 1–5 and Suites 1–3), the Eye Theatre, the Cardiothoracic Centre theatre and the A&E Theatre. Emergency cases are distributed across it according to the availability of a room rather than any settled rule, so an emergency may be held awaiting a theatre whose list has not finished while a theatre designated for emergencies stands unused, or the reverse. The purpose of a rule is to make the location of an emergency a settled matter rather than a negotiation conducted while the patient is deteriorating; a rule with stated exceptions can be audited, and the present arrangement cannot.',
    currentPractice:
      'Location is settled case by case on whatever room is free, with no rule and no recorded reason.',
    proposal:
      '(a) All emergency surgical cases at the A&E Theatre, established, equipped and staffed as a twenty-four-hour emergency operating facility. (b) Four exceptions only, each recorded on the booking with its reason: neurosurgical; specialised equipment or installed capability not available there, including cardiothoracic, ophthalmic, and imaging or endoscopic apparatus that cannot be brought; obstetric and gynaecological, at the Obstetric Emergency Theatre upon its reactivation; and where the A&E Theatre is itself occupied, the Theatre Manager on duty allocating the next available theatre with the reason recorded. (c) Resourced accordingly: dedicated sterile supply, dedicated consumable and drug pack holding replenished daily, dedicated equipment under prayer 1, dedicated environmental cover under prayer 3, and a standing establishment for continuous operation. Sought IMMEDIATELY; policy instrument only, at nil cost.',
  },
  {
    title: 'Prayer 5, consequential \u2014 Adoption of the Appendix A recording table for emergency location',
    area: 'EMERGENCY_PATHWAY',
    background:
      'Appendix A. The value of recording the exception is that exceptions can be counted. Should it emerge after some months that a particular exception is invoked far more often than the rule contemplates, that is information on which Management may act \u2014 by equipping the A&E Theatre for the case in question, or by amending the rule.',
    currentPractice:
      'Nothing is recorded on the booking about why a given theatre was used, so adherence and exception cannot be counted.',
    proposal:
      'That the Appendix A table be adopted as the recording requirement on every emergency booking in the application: general surgical, orthopaedic, urological, paediatric, plastic and all others not otherwise provided for at the A&E Theatre with no exception reason required; obstetric and gynaecological at the Obstetric Emergency Theatre on reactivation and at the A&E Theatre in the interim; neurosurgical as designated by the Division of Neurosurgery, exception recorded; cardiothoracic and ophthalmic at their own theatres, exception recorded as installed capability; cases requiring unavailable equipment at the nearest theatre having it, with the equipment named; and where the A&E Theatre is occupied, allocated by the Theatre Manager on duty with the occupying case identified.',
  },
  {
    title: 'Prayer 6 \u2014 Reactivation of the Obstetric Emergency Theatre with a dedicated anaesthesia team',
    area: 'EMERGENCY_PATHWAY',
    background:
      'Paragraph 7.2. The obstetric emergency is distinct in kind: time-critical in a manner peculiar to itself, concerning two patients, with the interval within which intervention alters outcome measured in tens of minutes. The case which occasioned the Panel of Inquiry \u2014 the stillbirth following a delayed emergency caesarean section of 26th July 2026 \u2014 was such a case.',
    currentPractice:
      'The Obstetric Emergency Theatre is not in operational use, and anaesthetic cover for an obstetric emergency must be found from among staff already committed elsewhere.',
    proposal:
      '(a) Reactivation and entry into the theatre register as an operational suite, equipped, sterile-supplied and staffed for continuous twenty-four-hour operation. (b) A dedicated anaesthesia team set aside for obstetric and gynaecological emergencies, rostered specifically to that theatre and not assignable to elective lists elsewhere during that duty. (c) Constituted jointly by the Departments of Anaesthesia and of Obstetrics and Gynaecology, and rostered weekly on the application in accordance with Management\u2019s directive of 11th June 2026. Sought at NINETY DAYS; refurbishment, equipment, sterile supply and establishment.',
  },
  {
    title: 'Prayer 6, consequential \u2014 Adoption of a decision-to-delivery interval for category-one obstetric emergencies',
    area: 'EMERGENCY_PATHWAY',
    background:
      'Paragraph 7.2(d). The submission asks that the interval be adopted as the standing measure, recorded on every such case and reported monthly, and expressly declines to propose the figure: it is for the Department of Obstetrics and Gynaecology to recommend against recognised practice, and for Management to adopt.',
    currentPractice:
      'No standing interval is adopted, and no decision-to-delivery time is recorded against obstetric emergency cases.',
    proposal:
      'That the Department of Obstetrics and Gynaecology recommend the interval against recognised practice and that Management adopt it; that it then be recorded on every category-one obstetric emergency and reported monthly. Taken as its own point because the figure is neither proposed by the submission nor within the Theatre Team\u2019s competence to set.',
  },
  {
    title: 'Prayer 7 \u2014 Reintegration of the A&E anaesthesia team under the Department of Anaesthesia',
    area: 'STAFFING_AND_ROLES',
    background:
      'Paragraph 7.3. The anaesthesia team attached to the A&E Theatre works outside the Department of Anaesthesia, so emergency anaesthesia is not delivered within a single line of professional supervision, a single roster, a single standard of practice, or a single arrangement for relief and escalation to consultant level.',
    currentPractice:
      'Emergency anaesthesia at the A&E Theatre sits outside the departmental line of supervision and roster.',
    proposal:
      '(a) Reintegration to work under the Department of Anaesthesia. (b) The Department, in exercising that responsibility, according emergency work the priority its urgency requires, and emergency cover not being depleted to service elective lists. (c) Effected by the Head of Department in consultation with the staff concerned and their representatives, and no member of staff suffering diminution of entitlement, allowance or standing by reason of it \u2014 the submission asks that this be stated expressly in any instrument giving effect to it, so a structural correction is not permitted to become an industrial grievance. Sought at THIRTY DAYS.',
  },
  {
    title: 'Prayer 8a \u2014 Blood bank, radiology, pharmacy and laboratory as parties to the emergency pathway',
    area: 'DIAGNOSTIC_AND_SUPPORT',
    background:
      'Paragraph 8. An emergency operation is not held up by the operation but by what must be obtained before it can begin: blood grouped and cross-matched, investigations resulted, imaging reported, drugs and consumables dispensed. Sought sequentially, the aggregate interval becomes the interval that was the subject of the Panel\u2019s inquiry. DISCLOSED IN THE SUBMISSION: the application carries emergency laboratory workup, blood requests and emergency pharmacy dispensing, but does NOT yet carry an equivalent for radiology.',
    currentPractice:
      'Each service is approached in turn, and the intervals between request, acknowledgement and delivery are not recorded against the case.',
    proposal:
      '(a) The Blood Transfusion Service, Radiology, Pharmaceutical Services and Laboratory Services formally constituted as parties to the emergency pathway, each designating a named officer on every shift answerable for emergency requests. (b) Every emergency request raised from and linked to the single emergency booking record, each service acknowledging receipt within the application, so that time of request, acknowledgement and delivery are recorded and reportable. (c) The four working in parallel from the moment of booking rather than in sequence, upon the single record. Named officers sought at THIRTY DAYS.',
  },
  {
    title: 'Prayer 8b \u2014 No emergency service withheld for want of payment, and the Emergency Treatment Revolving Fund',
    area: 'FINANCE_AND_REVENUE',
    background:
      'Paragraph 8, resting on the legal framework at paragraph 2. Payment is presently a precondition of commencement rather than a consequence of treatment, so the person dispatched to the cash office is frequently the one whose presence at the bedside the emergency requires, and the clock runs while they are gone. The submission is precise that the difficulty is not that the Hospital charges \u2014 it must \u2014 but the order of events. It states the revenue protection expressly: every item recorded against the case at the point of care by the officer who furnishes it, so the resulting bill is MORE complete than one assembled retrospectively and the leakage attending informal issue is reduced; recovery pursued after the patient is stable; and sums written off reported monthly, so the true cost of the Hospital\u2019s emergency obligation is a known figure provided for in the budget rather than absorbed invisibly and denied in principle.',
    currentPractice:
      'Emergency investigations, blood products, imaging, drugs and consumables await evidence of payment or the presence of a relative to make it.',
    proposal:
      '(d) That no emergency investigation, blood product, imaging study, drug or consumable be withheld or deferred by reason of non-payment, absence of a deposit, or absence of a relative to make payment: treatment to commence, the charge to be raised upon the record at the point of care, and recovery to follow. (e) That an Emergency Treatment Revolving Fund be established under the Directorate of Finance, charged at the point of delivery and replenished from recovery from the patient, from the NHIA or the relevant HMO, from the Vulnerable Group Fund where applicable, and from such indigent provision as Management may determine. The direction is sought IMMEDIATELY pending the Fund, which is sought at NINETY DAYS; Finance and Legal concurrence required.',
  },
  {
    title: 'Prayer 8b, consequential \u2014 Finance and Legal to examine recovery through the Vulnerable Group Fund and the NHIA',
    area: 'FINANCE_AND_REVENUE',
    background:
      'Paragraph 2(b). A separate recommendation addressed to the Directorate of Finance with the Legal Unit, distinct from the direction and the Fund themselves, and going to what proportion of the cost need ultimately fall on the Hospital at all.',
    currentPractice:
      'It is not established what part of emergency cost is recoverable through the Vulnerable Group Fund, the NHIA, or the Hospital\u2019s own social welfare provisions.',
    proposal:
      'That the Directorate of Finance, with the Legal Unit, examine what part of the cost contemplated at paragraph 8 may properly be recovered through the Vulnerable Group Fund established by the National Health Insurance Authority Act 2022, through the NHIA itself, or through the Hospital\u2019s own social welfare provisions, and report.',
  },
  {
    title: 'Prayer 9 \u2014 Not fewer than two dedicated multidisciplinary emergency teams',
    area: 'STAFFING_AND_ROLES',
    background:
      'Paragraph 9 and Table 1. The measures above will not hold if the people required to give effect to them must be drawn case by case from among staff already committed to elective work. Two teams are proposed as the minimum because a single team is by definition unavailable for the second emergency \u2014 and it is the second concurrent emergency, arriving while the first is in theatre, that produces the intervals with which the submission is concerned.',
    currentPractice:
      'Emergency staff are found case by case from those already committed to elective lists, and the identity of the team on duty at a given hour is a matter of enquiry rather than record.',
    proposal:
      'Two or more teams rostered to emergency duty and to no other duty during that period, receiving all emergencies from every specialty. Each per shift: one consultant on call and one senior resident from the specialty of the case; one anaesthetist with consultant cover, under the Department of Anaesthesia; one scrub and one circulating nurse; one anaesthetic technician; one recovery room nurse; one dedicated environmental officer for turnover and terminal cleaning; one porter assigned to the emergency theatre; a named CSSD officer answerable for emergency packs; the works and biomedical technicians of prayer 1; named blood bank, laboratory, radiology and pharmacy officers of prayer 8a; and one administrative officer of prayer 10. Rostered weekly on the application, composition auto-filled into the theatre allocation, so the team on duty at any hour is a matter of record and not of enquiry. Sought at THIRTY DAYS.',
  },
  {
    title: 'Prayer 10 \u2014 ICT and administrative establishment for documentation, with training, devices and connectivity',
    area: 'ICT_AND_DOCUMENTATION',
    background:
      'Paragraph 10. Every proposal above depends on a record made contemporaneously by the person doing the work, and clinical staff engaged upon an emergency cannot reasonably be its sole authors: where documentation competes with the patient it will properly lose. The submission repeats to Management the observation it made to the Panel \u2014 a requirement staff cannot physically meet produces false records rather than better ones, and a system of accountability that is not first a system of support will be defeated within a month.',
    currentPractice:
      'Documentation is left to clinical staff during the emergency itself, with no dedicated ICT support in the complex and no assured devices or network coverage.',
    proposal:
      '(a) Dedicated ICT staff posted to the complex to administer the application, maintain the devices and connectivity it depends on, and provide first-line support across all shifts. (b) Dedicated administrative and health-records staff assigned to the emergency teams, not fewer than one per team per shift, whose function is the contemporaneous entry of the booking, the timings, the acknowledgements and the outcome, so documentation is discharged by a person whose task it is. (c) A structured training programme on the application for all categories of theatre and emergency staff \u2014 including the environmental services staff of prayer 3 and the IPC and QA officers of prayer 4, whose appraisal is drawn in part from what the application records \u2014 with competence recorded against each user, refresher training at defined intervals, and induction for new staff before deployment. (d) The necessary devices and network coverage within the complex and the A&E Theatre. Sought at NINETY DAYS.',
  },
  {
    title: 'Prayer 11 \u2014 Constitution of the Theatre Restructuring Implementation Committee',
    area: 'GOVERNANCE',
    background:
      'Paragraph 11(a). The proposals cut across a dozen departments, several of which neither the Head of Theatre nor the Theatre Manager has authority to direct \u2014 a limit the submission states plainly at the outset, adding that nothing in it is intended as such a direction. Without a standing body to settle the detail and sequence the work, each proposal would proceed, or fail to, on its own.',
    currentPractice:
      'No body exists to settle the detail across departments, sequence the measures, or report progress to Management.',
    proposal:
      'A Theatre Restructuring Implementation Committee chaired as the Chief Medical Director may direct, comprising the Theatre Chairman, the Theatre Manager, the Head of Theatre, the Heads of Anaesthesia, Surgery, Obstetrics and Gynaecology, Accident and Emergency, Radiology, Pharmacy, Laboratory Services and Blood Transfusion, the Heads of Works and Biomedical Engineering, the Head of Environmental/Housekeeping Services, the Head of Infection Prevention and Control, the Director of Nursing Services, the Head of Health Information and ICT, and a representative of the Directorate of Finance; to settle the detail of these proposals, to sequence them, and to report progress to Management monthly.',
  },
  {
    title: 'Prayer 11, consequential \u2014 The ten measures to be reported monthly to the Medical Advisory Committee',
    area: 'GOVERNANCE',
    background:
      'Paragraph 11(b). Each is drawn from the application, and each corresponds to a proposal above: without them the restructuring cannot be shown to have taken effect, and the submission expects one of the figures \u2014 services withheld for payment \u2014 to be nil.',
    currentPractice:
      'These measures are not reported as a set, so the effect of any change cannot be demonstrated month on month.',
    proposal:
      'That the following be reported monthly to the MAC from the application: (i) median interval from emergency booking to commencement of anaesthesia, by specialty and shift; (ii) emergency cases exceeding the one-hour rule, with the reason recorded against each; (iii) decision-to-delivery interval for category-one obstetric emergencies; (iv) theatre fault reports with response and resolution intervals against the prayer 1 standard; (v) theatre attire issued, returned and outstanding, and days on which issue could not be met; (vi) between-case turnover and terminal cleaning intervals, and cases delayed for "theatre not ready or not cleaned"; (vii) IPC audit compliance, WHO checklist completion rates, and the SSI trend; (viii) acknowledgement intervals for blood, laboratory, radiology and pharmacy emergency requests; (ix) cases in which an emergency service was withheld or delayed for any reason connected with payment, expected to be nil; and (x) sums charged to and recovered against the Emergency Treatment Revolving Fund.',
  },
  {
    title: 'Appendix B \u2014 The establishment sought, and redeployment in preference to recruitment',
    area: 'STAFFING_AND_ROLES',
    background:
      'Appendix B, set out for the assistance of the Directorate of Administration. The figures are stated as the minimum for continuous twenty-four-hour cover on three shifts. The submission adds that where existing establishment permits redeployment rather than recruitment, redeployment is to be preferred, and marks in its timetable those measures it believes achievable by redeployment alone.',
    currentPractice:
      'No establishment has been approved for any of the posts the proposals depend on.',
    proposal:
      'That the Directorate of Administration consider the schedule: works/electrical technician 3–4 and biomedical engineering technician 3–4, all shifts with relief; environmental services officers at one per active theatre per shift plus common areas and relief, not redeployable, with 2–3 supervisors; infection prevention and control officers 2–3, resident, all shifts; quality assurance officers 1–2; scrub care providers 2–3 for the attire issue point morning and night; obstetric emergency anaesthetists per the Department of Anaesthesia; theatre nursing for two teams on all shifts per the Director of Nursing Services; information technology officers 2–3 across the complex and the A&E Theatre; administrative/health records officers 6, one per team per shift; and porters per the Theatre Manager. Redeployment to be preferred to recruitment wherever existing establishment permits.',
  },
  {
    title: 'Provision within the application \u2014 radiology workflow, the IPC and quality assurance module, and SSI surveillance',
    area: 'RECORDS_AND_AUDIT',
    background:
      'Not a prayer, but an undertaking the submission gives twice \u2014 at paragraphs 6 and 8(f) \u2014 and places in its own ninety-day timetable. It discloses that the application does NOT yet carry an IPC and quality assurance module, a role for such an officer, structured surgical site infection surveillance, or a radiology workflow equivalent to those for laboratory, blood and pharmacy. Both disclosures were made so that Management would not be given to understand the position was further advanced than it is. Prayer 4 and its appraisal instrument depend on the first: an appraisal drawn one half from documentation that does not yet exist cannot be operated.',
    currentPractice:
      'Neither module exists. IPC and QA officers would have nowhere to record their audits, and radiology requests cannot be raised from or acknowledged against the emergency booking record.',
    proposal:
      'That an owner and a date be set for building the radiology workflow, the infection prevention and quality assurance module including a role for the officer, and structured surgical site infection surveillance captured against the case. Placed at NINETY DAYS in the submission\u2019s own timetable.',
  },
  {
    title: 'Adoption of the implementation timetable and its phasing',
    area: 'GOVERNANCE',
    background:
      'Paragraph 12 and Table 2. The submission does not propose that the measures be attempted at once, and sequences them so as to place first what costs least and yields most: four measures immediately (the engineering posting and fault standard; the environmental dedication and cleaning record; the emergency location policy; the direction on payment), five at thirty days (environmental training and the turnover standard; the IPC and QA posting with its appraisal; anaesthesia reintegration and the emergency teams; the named diagnostic officers; the costed attire schedule), and four at ninety days (the Obstetric Emergency Theatre; the Revolving Fund; the ICT and administrative postings; and the application development).',
    currentPractice:
      'No sequence has been settled, so each measure would proceed, or fail to, on its own timing.',
    proposal:
      'That the phasing be adopted, amended or replaced, and that the dates decided here be recorded against each point above. Taken last so that the sitting settles what it is doing before it settles when \u2014 and so the sequence recorded on the points can be read against it.',
  },
];
