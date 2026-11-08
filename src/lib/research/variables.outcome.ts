// ============================================================
// Research variables: from the end of the operation to the ward
// ------------------------------------------------------------
// Blood, recovery, outcome, cancellation, documentation completeness, the team
// and the cost.
//
// THE COMPLETENESS DOMAIN IS NOT AN AFTERTHOUGHT, it is the denominator of
// every other domain in this module. A specialty whose records are 40 per cent
// complete is not a specialty with fewer complications — it is a specialty
// whose complications are mostly unrecorded, and a comparison that does not
// say so is misleading in the direction that flatters whoever documents least.
// ============================================================

import type { ResearchVariable, RawCase } from './types';
import { rec, at, operationNote, unsignedNoteOnly, bloodRequests, preOpReview, whoChecklist } from './access';
import {
  num, text, flag, recoveryStayMinutes, recoveryRecordOpen, aldreteTotal, aldreteReady,
  ponv, severePain, anyComplication, unplannedIcu, documentationScore, clinicalLabel,
} from './derive';

const v = (x: ResearchVariable): ResearchVariable => x;

export const BLOOD_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'bloodRequested', label: 'Blood requested', domain: 'blood', kind: 'boolean', derived: true,
    help: 'A blood request was raised for the case.',
    source: 'Blood bank',
    read: (c) => bloodRequests(c).length > 0,
  }),
  v({
    key: 'unitsRequested', label: 'Units requested', domain: 'blood', kind: 'numeric', unit: 'units',
    derived: true,
    help: 'Total units across every request raised for the case.',
    source: 'Blood bank',
    read: (c) => {
      const rs = bloodRequests(c);
      if (rs.length === 0) return null;
      return rs.reduce((a, r) => a + (num(r.unitsRequested) ?? 0), 0);
    },
  }),
  v({
    key: 'crossMatchCompleted', label: 'Cross-match completed', domain: 'blood', kind: 'boolean',
    derived: true,
    help: 'At least one request was cross-matched.',
    source: 'Blood bank',
    read: (c) => {
      const rs = bloodRequests(c);
      if (rs.length === 0) return null;
      return rs.some((r) => r.crossMatchCompleted === true);
    },
  }),
  v({
    key: 'bloodGiven', label: 'Blood transfused', domain: 'blood', kind: 'boolean',
    help: 'Blood products were actually given, from the intraoperative record.',
    source: 'Intraoperative record',
    read: (c) => flag(at(c, 'intraOperativeRecord', 'bloodProductsGiven')),
  }),
  v({
    key: 'bloodGroup', label: 'Blood group', domain: 'blood', kind: 'categorical', derived: true,
    help: 'Group and rhesus from the most recent request.',
    source: 'Blood bank',
    read: (c) => {
      const r = bloodRequests(c)[0];
      if (!r) return null;
      const g = text(r.bloodType);
      const rh = text(r.rhFactor);
      return g ? `${g}${rh ?? ''}` : null;
    },
  }),
  v({
    key: 'requestToReadyMinutes', label: 'Blood request to ready', domain: 'blood', kind: 'numeric',
    unit: 'minutes', derived: true,
    help: 'From the request being raised to the blood being ready. The blood bank turnaround a theatre actually waits on.',
    source: 'Blood bank',
    read: (c) => {
      const r = bloodRequests(c)[0];
      if (!r?.requestedAt || !r?.readyAt) return null;
      const a = new Date(r.requestedAt as never).getTime();
      const b = new Date(r.readyAt as never).getTime();
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      const m = Math.round((b - a) / 60_000);
      return m >= 0 ? m : null;
    },
  }),
];

const pacu = (c: RawCase) => rec(c, 'pacuAssessment');

export const RECOVERY_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'recoveryRecordExists', label: 'Recovery record exists', domain: 'recovery', kind: 'boolean',
    derived: true,
    help: 'A recovery record was opened for the case at all.',
    source: 'Recovery (PACU)',
    read: (c) => pacu(c) !== null,
  }),
  v({
    key: 'recoveryStayMinutes', label: 'Time in recovery', domain: 'recovery', kind: 'numeric',
    unit: 'minutes', derived: true,
    help: 'Admission to discharge from recovery. Stays beyond a day are excluded as unclosed records rather than reported, because one of them moves a mean by hours.',
    source: 'Recovery (PACU)',
    read: (c) => recoveryStayMinutes(pacu(c)?.admissionTime as never, pacu(c)?.dischargeTime as never),
  }),
  v({
    key: 'recoveryRecordOpen', label: 'Recovery record never closed', domain: 'recovery',
    kind: 'boolean', derived: true,
    help: 'A record was opened and no discharge was ever entered. A documentation finding, not a long stay.',
    source: 'Recovery (PACU)',
    read: (c) => recoveryRecordOpen(pacu(c)?.admissionTime, pacu(c)?.dischargeTime),
  }),
  v({
    key: 'aldreteOnArrival', label: 'Aldrete score on arrival', domain: 'recovery', kind: 'numeric',
    derived: true,
    help: 'Recomputed out of ten from its five components rather than read from the stored total, which a later edit can contradict. Null unless all five are present.',
    source: 'Recovery (PACU)',
    read: (c) => {
      const p = pacu(c);
      if (!p) return null;
      return aldreteTotal({
        activity: p.aldreteActivity, respiration: p.aldreteRespiration,
        circulation: p.aldreteCirculation, consciousness: p.aldreteConsciousness,
        oxygenSaturation: p.aldreteOxygenSaturation,
      });
    },
  }),
  v({
    key: 'aldreteReadyOnArrival', label: 'Aldrete 9 or more on arrival', domain: 'recovery',
    kind: 'boolean', derived: true,
    help: 'Nine or more, the usual threshold for fitness to leave recovery.',
    source: 'Recovery (PACU)',
    read: (c) => {
      const p = pacu(c);
      if (!p) return null;
      return aldreteReady(aldreteTotal({
        activity: p.aldreteActivity, respiration: p.aldreteRespiration,
        circulation: p.aldreteCirculation, consciousness: p.aldreteConsciousness,
        oxygenSaturation: p.aldreteOxygenSaturation,
      }));
    },
  }),
  v({
    key: 'painScoreOnArrival', label: 'Pain score on arrival', domain: 'recovery', kind: 'numeric',
    help: 'Pain out of ten on arrival in recovery.',
    source: 'Recovery (PACU)',
    read: (c) => num(pacu(c)?.painScoreOnAdmission),
  }),
  v({
    key: 'severePain', label: 'Severe pain on arrival', domain: 'recovery', kind: 'boolean',
    derived: true,
    help: 'Seven or more out of ten. The usual threshold in an analgesia audit.',
    source: 'Recovery (PACU)',
    read: (c) => severePain(pacu(c)?.painScoreOnAdmission),
  }),
  v({
    key: 'ponv', label: 'Nausea or vomiting in recovery', domain: 'recovery', kind: 'boolean',
    derived: true,
    help: 'Post-operative nausea and vomiting as one composite endpoint.',
    source: 'Recovery (PACU)',
    read: (c) => {
      const p = pacu(c);
      return p ? ponv(p.nauseaPresent, p.vomitingOccurred) : null;
    },
  }),
  v({
    key: 'hypothermia', label: 'Not normothermic on arrival', domain: 'recovery', kind: 'boolean',
    derived: true,
    help: 'The patient arrived in recovery outside normal temperature. An outcome in every warming study.',
    source: 'Recovery (PACU)',
    read: (c) => {
      const p = pacu(c);
      if (!p || p.normothermic === null || p.normothermic === undefined) return null;
      return p.normothermic !== true;
    },
  }),
  v({
    key: 'recoveryComplication', label: 'Complication in recovery', domain: 'recovery', kind: 'boolean',
    help: 'A complication detected in recovery.',
    source: 'Recovery (PACU)',
    read: (c) => flag(pacu(c)?.complicationsDetected),
  }),
  v({
    key: 'recoveryRedAlert', label: 'Red alert in recovery', domain: 'recovery', kind: 'boolean',
    help: 'A red alert was raised while the patient was in recovery.',
    source: 'Recovery (PACU)',
    read: (c) => flag(pacu(c)?.redAlertTriggered),
  }),
  v({
    key: 'oxygenTherapyInRecovery', label: 'Oxygen therapy in recovery', domain: 'recovery', kind: 'boolean',
    help: 'Supplementary oxygen was running on arrival.',
    source: 'Recovery (PACU)',
    read: (c) => flag(pacu(c)?.oxygenTherapy),
  }),
  v({
    key: 'dischargedTo', label: 'Discharged from recovery to', domain: 'recovery', kind: 'categorical',
    derived: true,
    help: 'Where the patient went when recovery released them.',
    source: 'Recovery (PACU)',
    read: (c) => clinicalLabel(pacu(c)?.dischargedTo),
  }),
];

export const OUTCOME_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'completed', label: 'Operation completed', domain: 'outcome', kind: 'boolean', derived: true,
    help: 'The case reached COMPLETED.',
    source: 'Booking',
    read: (c) => String(c.status ?? '') === 'COMPLETED',
  }),
  v({
    key: 'anyComplication', label: 'Any complication', domain: 'outcome', kind: 'boolean', derived: true,
    help: 'A composite: an intraoperative complication, an anaesthetic event, a complication in recovery, a red alert in recovery, or a count discrepancy. Null only when none of the contributing records exists.',
    source: 'Operation note, anaesthesia record, recovery, count sheet',
    read: (c) => {
      const a = rec(c, 'anesthesiaRecord');
      const anaesthetic = a
        ? ['hypotensionOccurred', 'hypertensionOccurred', 'bradycardiaOccurred',
          'tachycardiaOccurred', 'desaturationOccurred', 'difficultAirway', 'anaphylaxis']
          .some((k) => a[k] === true)
        : undefined;
      return anyComplication({
        intraOp: operationNote(c)?.complicationOccurred
          ?? at(c, 'intraOperativeRecord', 'complicationsOccurred') ?? undefined,
        anaesthetic,
        recovery: rec(c, 'pacuAssessment')?.complicationsDetected ?? undefined,
        recoveryRedAlert: rec(c, 'pacuAssessment')?.redAlertTriggered ?? undefined,
        countDiscrepancy: at(c, 'surgicalCount', 'discrepancyOccurred') ?? undefined,
      });
    },
  }),
  v({
    key: 'postOpDestination', label: 'Destination after theatre', domain: 'outcome', kind: 'categorical',
    derived: true,
    help: 'Where the patient was sent after the operation.',
    source: 'Booking and recovery',
    read: (c) => clinicalLabel(c.postOpDestination ?? rec(c, 'pacuAssessment')?.dischargedTo),
  }),
  v({
    key: 'unplannedIcu', label: 'Unplanned ICU admission', domain: 'outcome', kind: 'boolean',
    derived: true,
    help: 'The patient went to intensive care when the booking had not planned for it. A case booked for ICU and admitted to ICU is the plan working, not a complication, and is excluded.',
    source: 'Booking and recovery',
    read: (c) => unplannedIcu(c.needICU,
      c.postOpDestination ?? rec(c, 'pacuAssessment')?.dischargedTo),
  }),
  v({
    key: 'transferToIcu', label: 'Transferred to ICU from theatre', domain: 'outcome', kind: 'boolean',
    help: 'The anaesthesia record says the patient went straight to intensive care.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'transferToICU')),
  }),
  v({
    key: 'mortality', label: 'Death recorded', domain: 'outcome', kind: 'boolean', derived: true,
    help: 'A mortality record exists for this case.',
    source: 'Mortality registry',
    read: (c) => rec(c, 'mortality') !== null,
  }),
  v({
    key: 'mortalityLocation', label: 'Place of death', domain: 'outcome', kind: 'categorical',
    help: 'Where the death occurred, from the mortality registry.',
    source: 'Mortality registry',
    read: (c) => text(rec(c, 'mortality')?.location),
  }),
  v({
    key: 'causeOfDeath', label: 'Cause of death', domain: 'outcome', kind: 'categorical', derived: true,
    help: 'As recorded in the mortality registry.',
    source: 'Mortality registry',
    read: (c) => clinicalLabel(rec(c, 'mortality')?.causeOfDeath),
  }),
];

export const CANCELLATION_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'cancelled', label: 'Cancelled', domain: 'cancellation', kind: 'boolean', derived: true,
    help: 'The case was cancelled.',
    source: 'Cancellation record',
    read: (c) => String(c.status ?? '') === 'CANCELLED',
  }),
  v({
    key: 'cancellationCategory', label: 'Cancellation category', domain: 'cancellation', kind: 'categorical',
    help: 'The category the cancellation was filed under.',
    source: 'Cancellation record',
    read: (c) => text(rec(c, 'cancellation')?.category),
  }),
  v({
    key: 'cancellationReason', label: 'Cancellation reason', domain: 'cancellation', kind: 'categorical',
    derived: true,
    help: 'The reason as written.',
    source: 'Cancellation record',
    read: (c) => clinicalLabel(rec(c, 'cancellation')?.reason),
  }),
  v({
    key: 'cancelledOnTheDay', label: 'Cancelled on the day', domain: 'cancellation', kind: 'boolean',
    derived: true,
    help: 'Cancelled on the date it was listed for, as against cancelled in advance. On-the-day cancellation is the one that wastes a theatre and a fasted patient, and it is the only one most audits count.',
    source: 'Cancellation record',
    read: (c) => {
      const can = rec(c, 'cancellation');
      if (!can?.cancelledAt || !c.scheduledDate) return null;
      const a = new Date(can.cancelledAt as never);
      const b = new Date(c.scheduledDate as never);
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
      return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
    },
  }),
];

/** The records a COMPLETED case is expected to carry. */
const expectedRecords = (c: RawCase): Array<boolean | null> => [
  whoChecklist(c) !== null,
  rec(c, 'holdingAreaAssessment') !== null,
  rec(c, 'surgicalTiming') !== null,
  rec(c, 'intraOperativeRecord') !== null,
  rec(c, 'anesthesiaRecord') !== null,
  rec(c, 'surgicalCount') !== null,
  operationNote(c) !== null,
  rec(c, 'pacuAssessment') !== null,
];

export const DOCUMENTATION_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'documentationScore', label: 'Documentation completeness', domain: 'documentation',
    kind: 'numeric', derived: true,
    help: 'The share of the eight records a completed case should carry that actually exist: WHO checklist, holding area, timing sheet, intraoperative record, anaesthesia record, count sheet, signed operation note and recovery record. The denominator of every other figure in this module.',
    source: 'All theatre records',
    read: (c) => (String(c.status ?? '') === 'COMPLETED'
      ? documentationScore(expectedRecords(c))
      : null),
  }),
  v({
    key: 'signedNoteExists', label: 'Signed operation note', domain: 'documentation', kind: 'boolean',
    derived: true,
    help: 'A SIGNED operation note exists. An unsigned draft does not count, which is what the surgical practice figures on this page mean by "counted from signed operation notes".',
    source: 'Operation note',
    read: (c) => operationNote(c) !== null,
  }),
  v({
    key: 'noteDraftedNeverSigned', label: 'Note drafted but never signed', domain: 'documentation',
    kind: 'boolean', derived: true,
    help: 'A note was started and left unsigned. The commonest single documentation failure, and a different conversation from no note at all.',
    source: 'Operation note',
    read: (c) => unsignedNoteOnly(c),
  }),
  v({
    key: 'consentOnOrm', label: 'Consent on the ORM', domain: 'documentation', kind: 'boolean',
    derived: true,
    help: 'A consent the theatre can actually see: an uploaded form or one completed in the app. Paper in a folder is a real consent but is not visible here, and this variable says only what the ORM holds.',
    source: 'Booking',
    read: (c) => Boolean(c.consentFileName || c.consentUploadedAt
      || c.consentSignedElectronically || c.consentCompletedAt),
  }),
  v({
    key: 'timingSheetExists', label: 'Timing sheet recorded', domain: 'documentation', kind: 'boolean',
    derived: true,
    help: 'A surgical timing sheet exists. Every interval in the process domain depends on it.',
    source: 'Surgical timing sheet',
    read: (c) => rec(c, 'surgicalTiming') !== null,
  }),
  v({
    key: 'anaesthesiaRecordExists', label: 'Anaesthesia record exists', domain: 'documentation',
    kind: 'boolean', derived: true,
    help: 'An intraoperative anaesthesia monitoring record exists.',
    source: 'Anaesthesia record',
    read: (c) => rec(c, 'anesthesiaRecord') !== null,
  }),
  v({
    key: 'preOpReviewExists', label: 'Anaesthetic review exists', domain: 'documentation',
    kind: 'boolean', derived: true,
    help: 'A pre-operative anaesthetic review exists for the case.',
    source: 'Pre-op anaesthetic review',
    read: (c) => preOpReview(c) !== null,
  }),
];

export const TEAM_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'surgeon', label: 'Operating surgeon', domain: 'team', kind: 'categorical',
    help: 'The surgeon of record. Anonymised to a code in every export.',
    source: 'Booking',
    read: (c) => text(rec(c, 'surgeon')?.fullName) ?? text(c.surgeonName),
  }),
  v({
    key: 'surgeonGrade', label: 'Surgeon grade', domain: 'team', kind: 'categorical',
    help: 'The role on the surgeon’s account: consultant, senior registrar, registrar, house officer.',
    source: 'User account',
    read: (c) => text(rec(c, 'surgeon')?.role),
  }),
  v({
    key: 'anaesthetist', label: 'Anaesthetist', domain: 'team', kind: 'categorical',
    help: 'The anaesthetist of record. Anonymised to a code in every export.',
    source: 'Booking',
    read: (c) => text(rec(c, 'anesthetist')?.fullName),
  }),
  v({
    key: 'anaesthetistGrade', label: 'Anaesthetist grade', domain: 'team', kind: 'categorical',
    help: 'The role on the anaesthetist’s account.',
    source: 'User account',
    read: (c) => text(rec(c, 'anesthetist')?.role),
  }),
  v({
    key: 'consultantSupervised', label: 'Consultant named', domain: 'team', kind: 'boolean', derived: true,
    help: 'A supervising consultant is named on the case. The exposure in every supervision analysis.',
    source: 'Booking',
    read: (c) => Boolean(c.supervisingConsultantId || text(c.supervisingConsultantName)),
  }),
  v({
    key: 'consultantOperated', label: 'Consultant operated', domain: 'team', kind: 'boolean', derived: true,
    help: 'The surgeon of record holds a consultant role, as against operating under supervision.',
    source: 'User account',
    read: (c) => {
      const role = text(rec(c, 'surgeon')?.role);
      return role === null ? null : /CONSULTANT|HEAD_OF/.test(role);
    },
  }),
  v({
    key: 'teamSize', label: 'Team members recorded', domain: 'team', kind: 'numeric', derived: true,
    help: 'How many people were named on the case team.',
    source: 'Surgical team',
    read: (c) => {
      const t = c.teamMembers;
      return Array.isArray(t) ? t.length : null;
    },
  }),
];

export const COST_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'totalItemsCost', label: 'Consumables cost', domain: 'cost', kind: 'numeric', unit: '₦',
    help: 'What the case was costed at from the items list.',
    source: 'Booking',
    read: (c) => num(c.totalItemsCost),
  }),
  v({
    key: 'patientCharge', label: 'Patient charge', domain: 'cost', kind: 'numeric', unit: '₦',
    help: 'What the patient was charged.',
    source: 'Booking',
    read: (c) => num(c.patientCharge),
  }),
  v({
    key: 'depositConfirmed', label: 'Deposit confirmed', domain: 'cost', kind: 'boolean',
    help: 'A deposit was confirmed before the case.',
    source: 'Booking',
    read: (c) => flag(c.depositConfirmed),
  }),
];

export const OUTCOME_DOMAIN_VARIABLES: readonly ResearchVariable[] = [
  ...BLOOD_VARIABLES,
  ...RECOVERY_VARIABLES,
  ...OUTCOME_VARIABLES,
  ...CANCELLATION_VARIABLES,
  ...DOCUMENTATION_VARIABLES,
  ...TEAM_VARIABLES,
  ...COST_VARIABLES,
];
