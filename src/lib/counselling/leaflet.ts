// ============================================================
// Assembling one patient's leaflet
// ------------------------------------------------------------
// Pure. No Prisma, no fetch, no React — so what a patient is told can be
// tested against what the catalogue holds, without a database.
//
// THE ORDER IS THE ARGUMENT. A patient reads the top of a sheet and skims the
// rest, so the sheet is built in the order that matters if they read only the
// first half:
//
//   1. what this sheet is, and is not
//   2. your operation, in your surgeon's words        <- the specific part
//   3. why it is being offered, and what it should achieve
//   4. consent, and your right to change your mind
//   5. anaesthesia
//   6. eating and drinking                            <- what to do tonight
//   7. the specific risks of this kind of surgery
//   8. the general risks of any surgery
//   9. what else could be done instead
//  10. afterwards
//  11. warning signs                                  <- the one to re-read
//
// RESOLUTION, AND WHAT HAPPENS WHEN NOTHING MATCHES. A named procedure
// override wins; failing that the category; failing that, nothing. In that
// last case the leaflet is still issued, still carries every universal
// section, and says plainly that the operation-specific part will be
// explained by the surgeon. It does NOT invent the specific part. A sheet
// that guesses at the risks of an operation it does not recognise is worse
// than one that admits it, because the patient cannot tell the difference.
// ============================================================

import type { CounsellingEntry } from './types';
import { BY_CATEGORY, PROCEDURE_OVERRIDES } from './library';
import {
  ALERT_SECTION, ANAESTHESIA_SECTION, CONSENT_SECTION, COUNSELLING_VERSION,
  EMERGENCY_LINE, FASTING_DEFERRAL, FASTING_SECTION, GENERAL_RISK_SECTION,
  LEAFLET_PURPOSE, PRIVACY_NOTE, QUESTIONS_PROMPT, RECOVERY_SECTION,
  type CounsellingSection,
} from './universal';

export interface LeafletRequest {
  /** The operation, as it is written on the list. */
  procedureName: string;
  /** The slug, where the caller has one — matched against the overrides. */
  procedureSlug?: string | null;
  /** The catalogue category, where the procedure was matched to one. */
  category?: string | null;
  subspecialty?: string | null;
  /** The clinical reason for operating, in the surgeon's words. */
  indication?: string | null;
  /** Who it is for. Used for the heading, never for the clinical content. */
  patientName?: string | null;
  /** Folder or PT number, whichever the patient has. */
  patientIdentifier?: string | null;
  surgeonName?: string | null;
  /** Date of the operation, already formatted for reading. */
  scheduledFor?: string | null;
  unit?: string | null;
}

export interface Leaflet {
  title: string;
  patientName: string | null;
  patientIdentifier: string | null;
  /** Procedure, unit, surgeon, date — the facts at the head of the sheet. */
  facts: Array<{ label: string; value: string }>;
  purpose: string;
  sections: CounsellingSection[];
  questionsPrompt: string;
  emergencyLine: string;
  privacyNote: string;
  version: string;
  /**
   * True when operation-specific counselling was found.
   *
   * Carried out of here so the page and the PDF can both say so, and so a
   * test can assert that an unmatched procedure is handled honestly rather
   * than silently.
   */
  specificContentFound: boolean;
  /** Which key matched: a procedure slug, a category, or nothing. */
  matchedOn: 'procedure' | 'category' | 'none';
}

/** The entry for this operation, by the agreed precedence. */
export function resolveEntry(req: LeafletRequest): {
  entry: CounsellingEntry | null;
  matchedOn: Leaflet['matchedOn'];
} {
  const slug = (req.procedureSlug ?? '').trim();
  if (slug && PROCEDURE_OVERRIDES[slug]) {
    return { entry: PROCEDURE_OVERRIDES[slug], matchedOn: 'procedure' };
  }
  const category = (req.category ?? '').trim();
  if (category && BY_CATEGORY[category]) {
    return { entry: BY_CATEGORY[category], matchedOn: 'category' };
  }
  return { entry: null, matchedOn: 'none' };
}

const clean = (v: string | null | undefined) => (v ?? '').trim();

/**
 * What is said about the operation when the catalogue does not recognise it.
 *
 * Deliberately short, and deliberately not clinical. It tells the patient
 * exactly where the missing information is to be had — from the person who
 * has examined them — rather than filling the space with something generic
 * that reads like an answer.
 */
function unmatchedSection(procedureName: string): CounsellingSection {
  return {
    id: 'operation',
    heading: 'Your operation',
    body: [
      `You are listed for: ${procedureName}.`,
      'This sheet carries the general information that applies to any operation — consent, '
      + 'anaesthesia, eating and drinking, recovery and the warning signs. The part that is '
      + 'specific to this particular operation will be explained to you by your surgeon, who '
      + 'has examined you and knows your case.',
      'Please ask them to go through what the operation involves, what it should achieve, its '
      + 'particular risks, and what the alternatives are. Write the answers down.',
    ],
  };
}

export function buildLeaflet(req: LeafletRequest): Leaflet {
  const procedureName = clean(req.procedureName) || 'your operation';
  const { entry, matchedOn } = resolveEntry(req);

  const facts: Array<{ label: string; value: string }> = [];
  facts.push({ label: 'Operation', value: procedureName });
  if (clean(req.indication)) facts.push({ label: 'Reason', value: clean(req.indication) });
  if (clean(req.unit)) facts.push({ label: 'Unit', value: clean(req.unit) });
  if (clean(req.surgeonName)) facts.push({ label: 'Surgeon', value: clean(req.surgeonName) });
  if (clean(req.scheduledFor)) facts.push({ label: 'Planned for', value: clean(req.scheduledFor) });

  const sections: CounsellingSection[] = [];

  if (entry) {
    sections.push({
      id: 'operation',
      heading: 'Your operation',
      body: [
        `You are listed for: ${procedureName}.`,
        entry.whatItIs,
      ],
    });
    sections.push({
      id: 'why',
      heading: 'Why it is being offered, and what it should achieve',
      body: [entry.whyItIsDone],
      points: entry.benefits,
    });
  } else {
    sections.push(unmatchedSection(procedureName));
  }

  sections.push(CONSENT_SECTION);
  sections.push(ANAESTHESIA_SECTION);
  sections.push({
    ...FASTING_SECTION,
    body: [...FASTING_SECTION.body],
    // The deferral is appended here rather than stored inside the section, so
    // that the section itself stays a plain statement of the standard times
    // and the pointer back to the ward is always the last thing read.
    points: [...(FASTING_SECTION.points ?? []), FASTING_DEFERRAL],
  });

  if (entry) {
    sections.push({
      id: 'specific-risks',
      heading: 'Risks particular to this operation',
      body: [
        'These are in addition to the risks of any operation, listed below. Most patients have '
        + 'none of them. Your surgeon will tell you which apply most to you.',
      ],
      points: entry.risks,
    });
  }

  sections.push(GENERAL_RISK_SECTION);

  if (entry) {
    sections.push({
      id: 'alternatives',
      heading: 'What else could be done',
      body: [
        'You are entitled to know what the alternatives are, including doing nothing, and what '
        + 'is likely to happen with each.',
      ],
      points: entry.alternatives,
    });
    sections.push({
      ...RECOVERY_SECTION,
      body: [...RECOVERY_SECTION.body, entry.recovery],
    });
  } else {
    sections.push(RECOVERY_SECTION);
  }

  sections.push(ALERT_SECTION);

  return {
    title: 'Information about your operation',
    patientName: clean(req.patientName) || null,
    patientIdentifier: clean(req.patientIdentifier) || null,
    facts,
    purpose: LEAFLET_PURPOSE,
    sections,
    questionsPrompt: QUESTIONS_PROMPT,
    emergencyLine: EMERGENCY_LINE,
    privacyNote: PRIVACY_NOTE,
    version: COUNSELLING_VERSION,
    specificContentFound: entry !== null,
    matchedOn,
  };
}

/**
 * The leaflet as plain text.
 *
 * Used for the printable fallback and for anything that cannot render the
 * page. NOT used for WhatsApp: see counsellingMessage() in ./message, and
 * checkSendAllowed in lib/comms/policy for why clinical detail does not go
 * out on an external channel.
 */
export function leafletToText(leaflet: Leaflet): string {
  const out: string[] = [];
  out.push(leaflet.title.toUpperCase());
  if (leaflet.patientName) {
    out.push(
      leaflet.patientIdentifier
        ? `${leaflet.patientName} (${leaflet.patientIdentifier})`
        : leaflet.patientName,
    );
  }
  out.push('');
  for (const f of leaflet.facts) out.push(`${f.label}: ${f.value}`);
  out.push('');
  out.push(leaflet.purpose);

  for (const s of leaflet.sections) {
    out.push('');
    out.push(s.heading.toUpperCase());
    for (const p of s.body) out.push(p);
    for (const p of s.points ?? []) out.push(`  - ${p}`);
  }

  out.push('');
  out.push(leaflet.questionsPrompt);
  out.push('');
  out.push(leaflet.emergencyLine);
  out.push('');
  out.push(leaflet.privacyNote);
  out.push(`Information sheet version ${leaflet.version}.`);
  return out.join('\n');
}
