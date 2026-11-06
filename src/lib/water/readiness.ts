// ============================================================
// The daily readiness report, in the same shape as the status report
// ------------------------------------------------------------
// Two forms on one page ask about water: the shift status report, which is
// per room, and the daily readiness report, which promises that tomorrow's
// list can run. They were written months apart and shared nothing, so a
// readiness report that said NOT_READY raised a bell notification and then
// sat there, while a status report that said NO_WATER did the same, and
// neither of them ever had to be revisited and corrected.
//
// Asked for on 6 November: both must behave the same way. Anything that is
// not OK has to say what is wrong, what has been done, and what the plan B
// for water is that day; it has to chase the head of water supply and the
// head of works on WhatsApp; and it has to stay open until somebody goes
// back and re-assesses it.
//
// This file is the adapter that makes that possible: it turns the readiness
// report's four promises into the same {key, name, status} shape the status
// report already uses, so one escalation path serves both and the two cannot
// drift apart again.
//
// WHY THE PROBLEM AND THE ACTION ARE PER REPORT HERE, AND PER ROOM THERE.
// The status report asks about sixteen separate rooms, and "the Eye Theatre
// riser is shut" is not true of Theatre 2. The readiness report asks four
// questions about the same water, on the same day, and the answer to "what
// is wrong" is one answer. Asking for it four times would get it typed once
// and copied three times, which is worse than asking once.
// ============================================================

import type { WaterArea } from './waterAreas';

/** What a readiness aspect is called when it is not ready. */
export const READINESS_NOT_READY = 'NOT_READY';

export interface ReadinessAnswers {
  restroomsWaterReady?: boolean;
  scrubbingWaterReady?: boolean;
  theatreActivitiesWaterReady?: boolean;
  noShortageConfirmed?: boolean;
  /** READY | AT_RISK | NOT_READY */
  overallReadiness?: string;
  /** The problem, as the readiness form has always called it. */
  riskDetails?: string | null;
  actionTaken?: string | null;
}

/**
 * The four promises, in the order the form asks them.
 *
 * The key is what an open issue is tracked by, so it must never change: a
 * renamed key would orphan every issue opened under the old one, and they
 * would stay open for ever with nothing able to close them.
 */
export const READINESS_ASPECTS: {
  key: string;
  name: string;
  field: keyof ReadinessAnswers;
}[] = [
  { key: 'readiness:restrooms', name: 'Restrooms and toilets', field: 'restroomsWaterReady' },
  { key: 'readiness:scrubbing', name: 'Surgical scrubbing', field: 'scrubbingWaterReady' },
  { key: 'readiness:activities', name: 'All other theatre activities', field: 'theatreActivitiesWaterReady' },
  { key: 'readiness:shortage', name: 'No shortage expected', field: 'noShortageConfirmed' },
];

/** The key the overall verdict is tracked under when it is not READY. */
export const READINESS_OVERALL_KEY = 'readiness:overall';

/**
 * Everything about this readiness report that is not OK, as areas.
 *
 * Includes the overall verdict as an aspect of its own: a report can promise
 * all four and still be filed AT_RISK — the tanks are low, the borehole is
 * being worked on — and that is exactly the case the theatre needs chased.
 *
 * An area that is fine is NOT returned. The caller needs the not-OK ones to
 * open issues from, and the OK ones to close issues with, so both are given:
 * use `readinessAreas` for the full picture and `areasNotOk` on top of it.
 */
export function readinessAreas(answers: ReadinessAnswers): WaterArea[] {
  const problem = (answers.riskDetails ?? '').trim();
  const actionTaken = (answers.actionTaken ?? '').trim();
  const notes = (ok: boolean) => (ok ? {} : {
    ...(problem ? { problem } : {}),
    ...(actionTaken ? { actionTaken } : {}),
  });

  const aspects: WaterArea[] = READINESS_ASPECTS.map((a) => {
    const ok = answers[a.field] !== false;
    return {
      key: a.key,
      name: a.name,
      location: 'Daily water readiness',
      status: ok ? 'OK' : READINESS_NOT_READY,
      ...notes(ok),
    };
  });

  const overall = (answers.overallReadiness || 'READY').toUpperCase();
  aspects.push({
    key: READINESS_OVERALL_KEY,
    name: 'Water readiness for the next surgery day',
    location: 'Daily water readiness',
    status: overall === 'READY' ? 'OK' : overall,
    ...notes(overall === 'READY'),
  });

  return aspects;
}

/** Plain words for a readiness status, for a message or a board. */
export function readinessStatusLabel(status: string): string {
  if (status === 'OK' || status === 'READY') return 'Ready';
  if (status === 'AT_RISK') return 'At risk';
  if (status === READINESS_NOT_READY) return 'Not ready';
  return status.replace(/_/g, ' ').toLowerCase();
}
