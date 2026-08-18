// ============================================================
// Certifying a theatre ready, and meaning it
// ------------------------------------------------------------
// Marking a theatre ready already required every equipment check to be ticked.
// What it did not require was anybody to have understood what they were
// asserting — and a tick box that says "monitors checked" is a statement about
// a theatre, made to a surgical team who will act on it without going to look.
//
// So a declaration is acknowledged, and the ACKNOWLEDGEMENT IS RECORDED WITH
// THE WORDING THAT WAS ACKNOWLEDGED. That is the whole difference between this
// and a cosmetic warning: a dialog somebody dismissed leaves no evidence and
// proves nothing afterwards, and if the wording is later revised there is no
// way to say which version a person actually agreed to. The version travels
// with the record.
//
// The other half is the honest exit. A technician who cannot make a theatre
// ready must have somewhere to say so that is as easy as saying it is ready —
// otherwise the only route that works is the one that is false.
// ============================================================

/**
 * The declaration, and its version.
 *
 * Bump the version whenever the wording changes. Records keep the version they
 * were acknowledged under, so "what exactly did this person agree to" stays
 * answerable after the text is revised.
 *
 * The legal framing is deliberate and follows the institutional line: a
 * disciplinary matter under hospital policy and applicable law. It does not
 * assert that any particular statute has been broken, because no such
 * authority has been established here, and a warning that overstates its basis
 * is one a person can dismiss entirely once they notice.
 */
export const SETUP_DECLARATION_VERSION = '2026-08-18.1';

export const SETUP_DECLARATION_TITLE = 'Mandatory compliance notice';

export const SETUP_DECLARATION_BODY = [
  'Accurate theatre setup documentation is a professional and operational responsibility.',
  'Failure to set up the assigned theatre appropriately, or to document its setup status accurately, '
    + 'may constitute a serious disciplinary offence under applicable hospital policy and applicable law — '
    + 'particularly where inaccurate documentation misleads the surgical, anaesthetic or perioperative team '
    + 'about whether a theatre is ready.',
  'Do not certify a theatre as ready unless the required setup has actually been completed and checked.',
  'By confirming readiness you are digitally recording that this theatre has been appropriately prepared '
    + 'and checked by you.',
] as const;

/** The equipment checks, in the order a technician works through the room. */
export const SETUP_CHECKS = [
  { key: 'anesthesiaMachineChecked', label: 'Anaesthesia machine' },
  { key: 'gasSupplyChecked', label: 'Oxygen and gas supply' },
  { key: 'ventilatorChecked', label: 'Ventilator and breathing system' },
  { key: 'suctionChecked', label: 'Suction' },
  { key: 'monitorsChecked', label: 'Monitoring equipment' },
  { key: 'airwayEquipmentChecked', label: 'Airway and emergency airway equipment' },
  { key: 'emergencyDrugsChecked', label: 'Emergency drugs and resuscitation equipment' },
  { key: 'ivEquipmentChecked', label: 'IV equipment and consumables' },
] as const;

export type SetupCheckKey = typeof SETUP_CHECKS[number]['key'];

export type SetupChecks = Partial<Record<SetupCheckKey, boolean>>;

export interface CertifyInput {
  checks: SetupChecks;
  /** The technician certifying. Taken from the session, never the body. */
  technicianId?: string | null;
  /** True only when the declaration was actively acknowledged in this action. */
  declarationAcknowledged?: boolean;
  /** Which wording was acknowledged. */
  declarationVersion?: string | null;
}

export interface CertifyResult {
  ok: boolean;
  /** Everything preventing certification, so it is fixed in one pass. */
  problems: string[];
  /** Checks not yet ticked, by label, for the message the technician reads. */
  outstanding: string[];
}

/** Which checks are still outstanding. */
export function outstandingChecks(checks: SetupChecks): string[] {
  return SETUP_CHECKS.filter((c) => !checks[c.key]).map((c) => c.label);
}

/**
 * May this theatre be certified ready?
 *
 * Four conditions, and all four are section 19's: the checklist complete, the
 * technician identified, the declaration acknowledged, and — supplied by the
 * caller — a timestamp. Returned rather than thrown so the same answer drives
 * the disabled button and the 422.
 */
export function canCertifyReady(input: CertifyInput): CertifyResult {
  const problems: string[] = [];
  const outstanding = outstandingChecks(input.checks);

  if (outstanding.length > 0) {
    problems.push(
      `${outstanding.length} check${outstanding.length === 1 ? '' : 's'} still outstanding: ${outstanding.join(', ')}.`,
    );
  }

  if (!input.technicianId) {
    problems.push('The technician certifying the theatre must be identified.');
  }

  if (!input.declarationAcknowledged) {
    problems.push('The compliance declaration must be acknowledged before a theatre can be certified ready.');
  } else if (!input.declarationVersion) {
    // An acknowledgement with no wording attached cannot be evidence of
    // anything later, which is the entire point of recording it.
    problems.push('The acknowledgement did not record which declaration was agreed to.');
  }

  return { ok: problems.length === 0, problems, outstanding };
}

export const MIN_DEFICIENCY_LENGTH = 15;

export interface DeficiencyInput {
  deficiency: string;
  technicianId?: string | null;
}

export interface DeficiencyResult {
  ok: boolean;
  problem: string | null;
}

/**
 * Declaring a theatre NOT ready.
 *
 * Deliberately as easy to reach as certifying it ready, and never blocked by
 * the checklist: the whole point is that a technician who cannot complete the
 * setup has an honest route. Requiring the checks to be finished before
 * admitting they cannot be finished would leave only the false answer working.
 *
 * What it does require is a specific deficiency, because "not ready" alone
 * tells the anaesthetist nothing about whether the case can be moved to
 * another room or must wait for an engineer.
 */
export function canDeclareNotReady(input: DeficiencyInput): DeficiencyResult {
  if (!input.technicianId) {
    return { ok: false, problem: 'The technician reporting the deficiency must be identified.' };
  }
  if ((input.deficiency ?? '').trim().length < MIN_DEFICIENCY_LENGTH) {
    return {
      ok: false,
      problem: `Say what is wrong — at least ${MIN_DEFICIENCY_LENGTH} characters. `
        + 'The anaesthetist needs to know whether the case can move to another room or must wait.',
    };
  }
  return { ok: true, problem: null };
}

export type SetupStatusValue = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'BLOCKED';

export const SETUP_STATUS_LABEL: Record<SetupStatusValue, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Setup in progress',
  READY: 'Ready for case',
  BLOCKED: 'Not ready — deficiency identified',
};

/** How far through the checklist a theatre is, for the status table. */
export function setupProgress(checks: SetupChecks): { done: number; total: number; percent: number } {
  const done = SETUP_CHECKS.filter((c) => checks[c.key]).length;
  return {
    done,
    total: SETUP_CHECKS.length,
    percent: Math.round((done / SETUP_CHECKS.length) * 100),
  };
}
