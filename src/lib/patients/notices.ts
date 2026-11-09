// ============================================================
// What the hospital says to a patient, and what it is not allowed to say
// ------------------------------------------------------------
// Pure. The wording lives in lib/comms/templates.ts, because Meta has to
// approve it; this file decides WHICH words may fill the gaps, and renders the
// finished message so that the copy a nurse hands to WhatsApp and the copy the
// hospital records are the same string.
//
// WHY THE REASONS ARE A FIXED LIST, and not a text box.
//
// A text box here would be filled in, eventually, with "waiting for your HIV
// result" or "the tumour is bigger than we expected". Not out of carelessness —
// because the honest answer to "what is delaying it" is often clinical, and a
// nurse typing to a worried patient will reach for the honest answer. That
// message then sits on a phone that is shared, read over a shoulder and backed
// up to somebody's cloud account, and if one digit of the number was typed
// wrong at booking, it sits on a stranger's phone instead.
//
// So there is no box. There is a list, every entry of which is true, says
// something real about why the theatre is late, and gives nothing away about
// the patient's body. "Further preparation is needed before your operation" is
// the deliberate catch-all for the clinical case: it is honest, it is not a
// diagnosis, and the ward nurse is the one who explains the rest face to face.
//
// THE EATING INSTRUCTIONS DEFER, ALWAYS. Fasting advice is clinical advice, and
// this module does not know that a particular patient is diabetic, or a child,
// or on a drip. Every instruction below therefore ends by pointing back at the
// ward, and the templates repeat it. If this message and the ward nurse
// disagree, the patient has been told which to believe.
// ============================================================

import { renderTemplate } from '@/lib/comms/policy';
import {
  templateByCode, type PatientTemplateCode,
} from '@/lib/comms/templates';

export const HOSPITAL_NAME = 'UNTH Ituku-Ozalla, Theatre Complex';

/** The five things the hospital has to be able to tell a waiting patient. */
export type NoticeKind =
  | 'SAFETY' | 'PAYMENT_WARNING' | 'STILL_HOLDING' | 'RESCHEDULED' | 'CANCELLED';

export const TEMPLATE_FOR: Record<NoticeKind, PatientTemplateCode> = {
  SAFETY: 'PATIENT_SAFETY_NOTICE',
  PAYMENT_WARNING: 'PATIENT_PAYMENT_WARNING',
  STILL_HOLDING: 'PATIENT_CASE_HOLDING',
  RESCHEDULED: 'PATIENT_CASE_RESCHEDULED',
  CANCELLED: 'PATIENT_CASE_CANCELLED',
};

/**
 * The sentence naming what the deposit covers, for the payment warning.
 *
 * The figure is in it on purpose. A patient who has been told "your deposit is
 * ₦47,500, paid at the revenue unit" cannot be asked for ₦60,000 by somebody in
 * a corridor without noticing — which is more protection than any amount of
 * telling them to be careful. Where the amounts are not both settled it says so
 * plainly instead of inventing a total.
 */
export function depositSentence(input: {
  consumableAmount?: string | number | null;
  pharmacyAmount?: string | number | null;
}): string {
  const n = (v: string | number | null | undefined): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  const naira = (x: number) =>
    `NGN ${x.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const c = n(input.consumableAmount);
  const p = n(input.pharmacyAmount);

  if (c !== null && p !== null) {
    return `Your deposit is ${naira(c + p)} in total — ${naira(p)} for medicines and `
      + `${naira(c)} for theatre items — and it is paid at the hospital revenue unit.`;
  }
  if (c !== null) {
    return `Your deposit for theatre items is ${naira(c)}, paid at the hospital revenue unit.`;
  }
  if (p !== null) {
    return `Your deposit for medicines is ${naira(p)}, paid at the hospital revenue unit.`;
  }
  // A deposit row exists but carries no figure yet. Saying "your deposit is
  // NGN 0.00" would be worse than saying nothing, and inviting them to pay an
  // unknown amount is exactly the gap this message is trying to close.
  return 'Your deposit is being worked out and will be paid at the hospital revenue unit — '
    + 'your ward nurse will tell you the amount.';
}

export interface Choice {
  key: string;
  /** What staff see in the list. */
  label: string;
  /** What the patient reads. Written to sit inside the template's sentence. */
  patientWords: string;
}

/**
 * Why the list is running late, for a patient who is still going to theatre.
 *
 * Phrased so each one completes "What is holding things up: ____." and reads as
 * a fact about the theatre rather than an excuse.
 */
export const DELAY_REASONS: Choice[] = [
  {
    key: 'CASE_OVERRAN',
    label: 'The operation before this one is still going on',
    patientWords: 'the operation before yours is taking longer than expected',
  },
  {
    key: 'EMERGENCY_TOOK_PRIORITY',
    label: 'An emergency had to be taken first',
    patientWords: 'an emergency came in and had to be treated first',
  },
  {
    key: 'THEATRE_BEING_PREPARED',
    label: 'The theatre is being cleaned and set up',
    patientWords: 'the theatre is being cleaned and set up for you',
  },
  {
    key: 'TEAM_NOT_FREE',
    label: 'The surgical or anaesthetic team is not yet free',
    patientWords: 'we are waiting for your surgical team to be free',
  },
  {
    key: 'WAITING_BLOOD',
    label: 'Waiting for blood to be ready',
    patientWords: 'we are making sure everything you may need is ready first',
  },
  {
    key: 'WAITING_RECOVERY_BED',
    label: 'Waiting for a recovery or intensive-care bed',
    patientWords: 'we are waiting for a bed to be free for your care afterwards',
  },
  {
    key: 'EQUIPMENT_BEING_STERILISED',
    label: 'Equipment is still being sterilised',
    patientWords: 'the equipment for your operation is still being sterilised',
  },
  {
    key: 'FURTHER_PREPARATION',
    label: 'Further preparation is needed (anything clinical)',
    patientWords: 'a little more preparation is needed before we can start',
  },
];

/**
 * Why an operation moved or was called off.
 *
 * Deliberately overlapping with the delay list but worded for a change rather
 * than a wait — "an emergency came in" explains a two-hour delay and a
 * cancelled list equally, and a patient should hear the same reason either way.
 */
export const CHANGE_REASONS: Choice[] = [
  {
    key: 'EMERGENCY_TOOK_PRIORITY',
    label: 'An emergency had to be taken first',
    patientWords: 'an emergency operation had to be treated first',
  },
  {
    key: 'LIST_OVERRAN',
    label: 'The list ran longer than expected',
    patientWords: 'the operations before yours took longer than expected',
  },
  {
    key: 'THEATRE_UNAVAILABLE',
    label: 'Theatre or equipment not available',
    patientWords: 'the theatre or the equipment needed was not available',
  },
  {
    key: 'BED_UNAVAILABLE',
    label: 'No recovery or intensive-care bed',
    patientWords: 'a bed for your care after the operation was not available',
  },
  {
    key: 'TEAM_UNAVAILABLE',
    label: 'A member of the team was not available',
    patientWords: 'a member of your surgical team was not available',
  },
  {
    key: 'FURTHER_PREPARATION',
    label: 'Further preparation needed (anything clinical)',
    patientWords: 'a little more preparation is needed first, to keep you safe',
  },
  {
    key: 'AT_YOUR_REQUEST',
    label: 'At the patient\'s own request',
    patientWords: 'you asked us to move it',
  },
];

/**
 * What the patient should do about eating and drinking.
 *
 * Every one of these ends at the ward nurse. The hospital's own fasting rule
 * varies by case and by anaesthetic, and a message cannot know which applies —
 * so these say the ordinary thing and hand the decision back to the person at
 * the bedside who can see the chart.
 */
export const EATING_INSTRUCTIONS: Choice[] = [
  {
    key: 'FAST_FROM_MIDNIGHT',
    label: 'Nothing to eat from midnight; water until early morning',
    patientWords:
      'please do not eat anything, including milk, from midnight the night before. '
      + 'You may drink plain water until 6 a.m., and nothing at all after that. '
      + 'Bring your folder and any medicines you take. Your ward nurse will confirm '
      + 'the exact times for you.',
  },
  {
    key: 'FAST_SIX_HOURS',
    label: 'Nothing to eat for six hours before; water until two hours before',
    patientWords:
      'please do not eat anything for six hours before you are called, and drink '
      + 'only plain water up to two hours before. Bring your folder and any medicines '
      + 'you take. Your ward nurse will confirm the exact times for you.',
  },
  {
    key: 'KEEP_TO_CURRENT',
    label: 'Keep to the instructions already given',
    patientWords:
      'please keep to the eating and drinking instructions your nurse has already '
      + 'given you, unless they tell you something different.',
  },
  {
    key: 'EAT_NORMALLY',
    label: 'You may eat and drink normally again',
    patientWords:
      'you may eat and drink normally again now, unless your nurse tells you '
      + 'otherwise. If you feel unwell, please tell them straight away.',
  },
  {
    key: 'AWAIT_WARD',
    label: 'The ward will say when to stop eating',
    patientWords:
      'please eat and drink as normal for now. Your ward nurse will tell you when '
      + 'to stop, nearer the time.',
  },
];

const byKey = (list: Choice[], key: string | null | undefined): Choice | null =>
  list.find((c) => c.key === key) ?? null;

export const delayReason = (key: string | null | undefined) => byKey(DELAY_REASONS, key);
export const changeReason = (key: string | null | undefined) => byKey(CHANGE_REASONS, key);
export const eatingInstruction = (key: string | null | undefined) =>
  byKey(EATING_INSTRUCTIONS, key);

/** Which list a kind draws its reason from, and whether it needs one at all. */
export function reasonsFor(kind: NoticeKind): Choice[] {
  if (kind === 'SAFETY' || kind === 'PAYMENT_WARNING') return [];
  if (kind === 'STILL_HOLDING') return DELAY_REASONS;
  return CHANGE_REASONS;
}

export interface NoticeInput {
  kind: NoticeKind;
  patientName: string;
  /** Where the patient goes to leave anonymous feedback. */
  feedbackLink: string;
  hospitalName?: string;
  /** Key from reasonsFor(kind). Required for everything but SAFETY. */
  reasonKey?: string | null;
  /** Key from EATING_INSTRUCTIONS. Required for RESCHEDULED and CANCELLED. */
  instructionKey?: string | null;
  /** When they should expect to be sent for. STILL_HOLDING only. */
  expected?: string | null;
  /** The new date, already written the way a patient reads dates. RESCHEDULED only. */
  newDate?: string | null;
  /** The sentence from depositSentence(). PAYMENT_WARNING only. */
  deposit?: string | null;
}

export type NoticeResult =
  | { ok: true; templateCode: PatientTemplateCode; variables: Record<string, string>; text: string }
  /** What is still needed, in words for the person filling the form in. */
  | { ok: false; problem: string };

/**
 * Build the message.
 *
 * Rendered from the TEMPLATE body rather than assembled here, so the text a
 * nurse sends by hand through WhatsApp and the text recorded against the case
 * are the same string by construction. They used to be able to differ, and a
 * record of what the hospital told a patient is worth nothing if it is only
 * approximately what the hospital told them.
 */
export function buildPatientNotice(input: NoticeInput): NoticeResult {
  const name = (input.patientName ?? '').trim();
  if (!name) return { ok: false, problem: 'The patient has no name on file to address.' };

  const link = (input.feedbackLink ?? '').trim();
  if (!link) return { ok: false, problem: 'No feedback link is configured to include.' };

  const code = TEMPLATE_FOR[input.kind];
  const spec = templateByCode(code);
  if (!spec) return { ok: false, problem: `The ${input.kind} message is not configured.` };

  const variables: Record<string, string> = {
    name,
    hospital: input.hospitalName?.trim() || HOSPITAL_NAME,
    feedbackLink: link,
  };

  if (input.kind === 'PAYMENT_WARNING') {
    const deposit = (input.deposit ?? '').trim();
    if (!deposit) {
      // Refused rather than sent with the sentence left out. The warning works
      // BECAUSE it names what is owed and where it is paid; without that it is
      // a general caution the patient has already had, and it would be going
      // out about a case that has no deposit set at all.
      return {
        ok: false,
        problem: 'This case has no drug or consumable deposit set, so there is nothing to '
          + 'tell the patient to pay. Set the deposit first.',
      };
    }
    variables.deposit = deposit;
  }

  if (input.kind !== 'SAFETY' && input.kind !== 'PAYMENT_WARNING') {
    const reason = byKey(reasonsFor(input.kind), input.reasonKey);
    if (!reason) {
      return { ok: false, problem: 'Choose a reason the patient can be given.' };
    }
    variables.reason = reason.patientWords;
  }

  if (input.kind === 'STILL_HOLDING') {
    const expected = (input.expected ?? '').trim();
    if (!expected) {
      return {
        ok: false,
        // A delay message with no horizon is the message the patient already
        // has — they know they are waiting. The point is to say until when.
        problem: 'Say when you expect to send for them, even roughly.',
      };
    }
    variables.expected = expected;
  }

  if (input.kind === 'RESCHEDULED') {
    const when = (input.newDate ?? '').trim();
    if (!when) return { ok: false, problem: 'A new date is needed for this message.' };
    variables.newDate = when;
  }

  if (input.kind === 'RESCHEDULED' || input.kind === 'CANCELLED') {
    const how = eatingInstruction(input.instructionKey);
    if (!how) {
      return {
        ok: false,
        // The commonest harm from a late change: nobody told the patient
        // whether fasting still applies, so they either starve for nothing or
        // eat before an operation that is still on.
        problem: 'Choose what the patient should do about eating and drinking.',
      };
    }
    variables.instructions = how.patientWords;
  }

  const rendered = renderTemplate(spec.body, variables);
  if (rendered.missing.length) {
    return { ok: false, problem: `The message is missing: ${rendered.missing.join(', ')}.` };
  }

  return { ok: true, templateCode: code, variables, text: rendered.body };
}

/** One line for the case record, so the trail says what was told to whom. */
export function noticeAuditLine(kind: NoticeKind, toLabel: string): string {
  const what: Record<NoticeKind, string> = {
    SAFETY: 'the safety notice about lists and payments',
    PAYMENT_WARNING: 'that the deposit is paid at the revenue unit and nowhere else',
    STILL_HOLDING: 'that the case is still going ahead, and what is delaying it',
    RESCHEDULED: 'that the operation has moved, with the new date',
    CANCELLED: 'that the operation will not go ahead as planned',
  };
  return `Told ${toLabel}: ${what[kind]}.`;
}
