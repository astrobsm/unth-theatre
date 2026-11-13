/**
 * "I still can't find where you indicated day cases on the booked surgeries."
 *
 * The flag was real, on every board, and correct. It rendered on nothing,
 * because nothing in the database was ever marked a day case: the question was
 * an unchecked checkbox in the "Post-operative disposition" block two steps
 * into the wizard, and an unchecked box is indistinguishable from a considered
 * "inpatient". Every case claimed to be an inpatient on equal authority — the
 * ones somebody decided and the ones nobody read.
 *
 * So these tests hold three things, and the third is the one that will be
 * eroded first:
 *
 *   1. The conversion between the answer and the stored boolean, both ways.
 *   2. That the question is asked where everyone passes, with no default.
 *   3. That the answer cannot be skipped — on EITHER submit path, and WITHOUT
 *      the browser's `required` attribute, which on a step hidden by
 *      `display:none` makes the whole form unsubmittable with nothing but a
 *      console message no surgeon will ever see.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ADMISSION_TYPE_OPTIONS,
  ADMISSION_MISSING_MESSAGE,
  admissionLabel,
  admissionTypeChosen,
  admissionTypeFromDraft,
  admissionTypeOf,
  isDayCaseFrom,
  postOpDestinationFor,
} from '../../src/lib/booking/admissionType';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const FORM = read('src/app/dashboard/surgeries/new/page.tsx');
const SCHEDULE = read('src/app/dashboard/surgeries/page.tsx');
const FLAG = read('src/components/DayCaseFlag.tsx');
const DRAFT = read('src/lib/booking/draftState.ts');

/** Source with comment lines removed, for assertions about absence. */
const code = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

describe('the two answers', () => {
  it('offers exactly two, inpatient first', () => {
    // Inpatient first because it is the commoner case, and because a list
    // whose first entry is the exception teaches people to pick the first.
    expect(ADMISSION_TYPE_OPTIONS.map((o) => o.value)).toEqual(['INPATIENT', 'DAY_CASE']);
  });

  it('says the consequence in the option text, not only the category', () => {
    // "Day case" alone reads as a statement about discharge. The mistake it
    // has to prevent is an assumption about where the patient is tonight.
    const dayCase = ADMISSION_TYPE_OPTIONS[1].label;
    expect(dayCase).toMatch(/comes in on the morning/i);
    expect(ADMISSION_TYPE_OPTIONS[0].label).toMatch(/ward/i);
  });

  it('converts the answer to the column the database holds', () => {
    expect(isDayCaseFrom('DAY_CASE')).toBe(true);
    expect(isDayCaseFrom('INPATIENT')).toBe(false);
  });

  it('converts a stored case back to the answer for the dropdown', () => {
    expect(admissionTypeOf(true)).toBe('DAY_CASE');
    expect(admissionTypeOf(false)).toBe('INPATIENT');
  });
});

describe('an unanswered question is not an answer', () => {
  it('reports nothing chosen for blank, null and rubbish', () => {
    for (const v of ['', null, undefined, 'MAYBE', 'inpatient']) {
      expect(admissionTypeChosen(v as string), String(v)).toBe(false);
    }
    expect(admissionTypeChosen('INPATIENT')).toBe(true);
    expect(admissionTypeChosen('DAY_CASE')).toBe(true);
  });

  it('does not let a blank masquerade as an inpatient on the way out', () => {
    // isDayCaseFrom('') is false, which is right for storage and wrong as a
    // test of whether anybody chose. Keeping the two questions apart is the
    // whole point of there being two functions.
    expect(isDayCaseFrom('')).toBe(false);
    expect(admissionTypeChosen('')).toBe(false);
  });

  it('restores an old draft as unanswered rather than inventing inpatient', () => {
    // A draft written before this field existed carries isDayCase:false from
    // the old unchecked box. Reading that as a deliberate "inpatient" would
    // re-create the exact bug, one draft at a time.
    expect(admissionTypeFromDraft({ isDayCase: false })).toBe('');
    expect(admissionTypeFromDraft({})).toBe('');
    expect(admissionTypeFromDraft(null)).toBe('');
    // A true was a real tick, so it carries over.
    expect(admissionTypeFromDraft({ isDayCase: true })).toBe('DAY_CASE');
    // And a draft that has the field uses it.
    expect(admissionTypeFromDraft({ admissionType: 'INPATIENT', isDayCase: true })).toBe('INPATIENT');
  });

  it('ignores a draft value that is not one of the two', () => {
    expect(admissionTypeFromDraft({ admissionType: 'OUTPATIENT' })).toBe('');
  });
});

describe('the post-op destination it implies', () => {
  it('offers same-day discharge when the destination is still empty', () => {
    expect(postOpDestinationFor('DAY_CASE', '')).toBe('DAY_CASE_DISCHARGE');
  });

  it('never overwrites a destination the booker chose', () => {
    // A day case can legitimately be planned to recovery first. Silently
    // contradicting a clinician is worse than leaving the two to disagree.
    expect(postOpDestinationFor('DAY_CASE', 'RECOVERY_THEN_WARD')).toBe('RECOVERY_THEN_WARD');
    expect(postOpDestinationFor('INPATIENT', 'ICU')).toBe('ICU');
  });

  it('leaves an inpatient destination alone, including an empty one', () => {
    expect(postOpDestinationFor('INPATIENT', '')).toBe('');
    expect(postOpDestinationFor('', '')).toBe('');
  });
});

describe('the booking form asks it where everyone passes', () => {
  it('puts the dropdown on the Schedule step, beside the date', () => {
    // Not on the disposition block two steps in: a case is bookable from the
    // "Book now" button before that, and almost nobody walks a six-step
    // wizard to the end. The date field is the anchor.
    const dateAt = FORM.indexOf('name="scheduledDate"');
    const selectAt = FORM.indexOf('id="admissionType"');
    // Anchored on the disposition block rather than on the "Book now"
    // button, whose text also appears in a comment near the top of the
    // file and is therefore useless as a position.
    // The JSX marker, not the bare phrase: the explanatory comment beside
    // the dropdown itself contains those words, and an anchor that matches
    // its own rationale measures nothing.
    const dispositionAt = FORM.indexOf('{/* Post-operative disposition */}');
    expect(dateAt).toBeGreaterThan(-1);
    expect(dispositionAt).toBeGreaterThan(-1);
    expect(selectAt).toBeGreaterThan(dateAt);
    expect(selectAt).toBeLessThan(dispositionAt);
  });

  it('builds the options from the one list, not a second copy', () => {
    expect(FORM).toContain('ADMISSION_TYPE_OPTIONS.map');
    // Two hand-written <option> values would drift from the module the moment
    // either changed.
    expect(code(FORM)).not.toContain('<option value="DAY_CASE"');
    expect(code(FORM)).not.toContain('<option value="INPATIENT"');
  });

  it('starts with nothing selected', () => {
    expect(FORM).toContain("const [admissionType, setAdmissionType] = useState<AdmissionType | ''>('')");
  });

  it('derives the stored boolean instead of keeping a second state', () => {
    // Two pieces of state for one fact is two pieces of state that disagree.
    expect(FORM).toContain('const isDayCase = isDayCaseFrom(admissionType);');
    expect(code(FORM)).not.toContain('setIsDayCase');
  });

  it('has retired the checkbox that was missed', () => {
    expect(code(FORM)).not.toContain('Day case (admitted &amp; discharged same day)');
  });

  it('still sends isDayCase, so every existing reader is untouched', () => {
    // Four APIs, three boards, the research variable, the holding-area gate.
    // None of them should have to know this field changed shape.
    expect(FORM).toContain('isDayCase: isDayCase,');
  });

  it('asks again for the next patient on the same list', () => {
    // Unit, date and surgeon belong to the list and are kept. Admission type
    // belongs to the patient: a list runs a day case and an inpatient one
    // after the other.
    const reset = FORM.slice(FORM.indexOf('onNextPatient'), FORM.indexOf('onNextPatient') + 3000);
    expect(reset).toContain("setAdmissionType('')");
  });
});

describe('the answer cannot be skipped', () => {
  it('is checked before the early-booking shortcut, so neither button evades it', () => {
    // The early "Book now" button carries formNoValidate and goToStep does not
    // validate, which is why the essentials are checked in JavaScript. This
    // check sits above the point where that path splits off.
    const gateAt = FORM.indexOf('if (!admissionTypeChosen(admissionType))');
    const earlySplitAt = FORM.indexOf('const bookingEarly = bookEarlyRef.current;');
    expect(gateAt).toBeGreaterThan(-1);
    expect(earlySplitAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(earlySplitAt);
  });

  it('does NOT use the browser required attribute on that select', () => {
    // stepClass() hides a step with `hidden`, i.e. display:none, and the
    // browser will not validate a control it cannot focus: the submit fails
    // with "an invalid form control is not focusable" in the console and
    // nothing at all on screen. A `required` here would make the form
    // unsubmittable from any step but the Schedule step.
    const select = FORM.slice(FORM.indexOf('id="admissionType"'), FORM.indexOf('id="admissionType"') + 900);
    expect(select).not.toMatch(/^\s*required\s*$/m);
    // It is still announced as required to anyone using a screen reader.
    expect(select).toContain('aria-required="true"');
  });

  it('sends the booker to the field rather than only naming it', () => {
    const gate = FORM.slice(FORM.indexOf('if (!admissionTypeChosen(admissionType))'));
    expect(gate.slice(0, 1200)).toContain('setStep(1)');
    expect(gate.slice(0, 1200)).toContain("document.getElementById('admissionType')");
  });

  it('explains the cost in the refusal, not just that a field is empty', () => {
    expect(ADMISSION_MISSING_MESSAGE).toMatch(/inpatient or a day case/i);
    const gate = FORM.slice(FORM.indexOf('if (!admissionTypeChosen(admissionType))'), FORM.indexOf('if (!admissionTypeChosen(admissionType))') + 1200);
    expect(gate).toMatch(/walking to a bed/i);
  });

  it('carries the answer across a saved draft', () => {
    expect(DRAFT).toContain('admissionType?: string;');
    expect(FORM).toContain('setAdmissionType(admissionTypeFromDraft(d));');
  });
});

describe('the schedule page says which it is, under the name', () => {
  it('prints both answers, not only the day case', () => {
    // With only one of the two marked, an unmarked row means "inpatient" or
    // "the flag did not render" or "nobody answered" — three different things
    // that look identical, and the third was the truth for every case until
    // the question became required. This is what was actually reported.
    expect(SCHEDULE).toContain('<DayCaseFlag className="mt-1" />');
    expect(SCHEDULE).toContain('<InpatientNote className="mt-1" />');
    expect(SCHEDULE).toContain("import DayCaseFlag, { InpatientNote } from '@/components/DayCaseFlag'");
  });

  it('keeps both directly under the patient name, above the folder number', () => {
    // No newline in the anchor: the file is CRLF on disk and a literal
    // '\n' would never match, which is a test that silently stops
    // checking anything.
    const markerAt = SCHEDULE.indexOf('{surgery.isDayCase');
    const identifierAt = SCHEDULE.indexOf('{label.identifier}');
    expect(markerAt).toBeGreaterThan(-1);
    expect(identifierAt).toBeGreaterThan(-1);
    expect(markerAt).toBeLessThan(identifierAt);
  });

  it('keeps the inpatient mark recessive', () => {
    // The ordinary case must not compete with the warning: no border, no
    // icon, grey text. If this ever grows a colour the day-case band stops
    // being the thing the eye lands on.
    const note = FLAG.slice(FLAG.indexOf('export function InpatientNote'));
    expect(note).toContain('text-gray-400');
    expect(note).not.toContain('border');
    expect(note).not.toContain('AlertTriangle');
  });

  it('agrees with the words used everywhere else', () => {
    expect(admissionLabel(true)).toBe('Day case');
    expect(admissionLabel(false)).toBe('Inpatient');
    expect(admissionLabel(null)).toBe('Inpatient');
    const note = FLAG.slice(FLAG.indexOf('export function InpatientNote'));
    expect(note).toContain('Inpatient');
  });
});
