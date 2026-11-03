// ============================================================
// Telling the surgical team their patient was not in the ward
// ------------------------------------------------------------
// The anaesthetist has walked to the ward, found an empty bed, and recorded
// it. Nothing is fixed by that record on its own: somebody still has to
// produce the patient, or say out loud that this is a day case and the review
// will happen in the holding area in the morning.
//
// WHO THIS IS WRITTEN TO. Whoever booked the case, and the surgeon on it. Not
// the anaesthetic department — there is nothing for another anaesthetist to do
// about a patient who is not there, and sending one would waste a second trip.
//
// THE TONE IS THE WHOLE DESIGN. This arrives on a consultant surgeon's phone
// from a registrar in anaesthesia, which is a difficult direction for a
// message to travel. So it states facts, asks one question, and claims
// nothing: the patient was not in the ward at this time, the review cannot be
// done without them, which of these is it. A message that implied the surgeon
// had failed would be answered with an argument instead of a patient.
//
// It does not name a sanction. The 9pm lapse and the summons that follows are
// real and automatic, and mentioning them here would read as a threat made by
// a junior colleague rather than a rule the department set.
// ============================================================

export interface PatientAbsentMessageInput {
  /** Who is being written to. */
  recipientName: string | null;
  /** The anaesthetist who attended. */
  attendedByName: string | null;
  patientName: string | null;
  folderNumber: string | null;
  /** The ward the case names, if any. */
  ward?: string | null;
  procedureName: string | null;
  /** The operating day, already in long form. */
  surgeryDay: string;
  scheduledTime?: string | null;
  /** WAT wall-clock time of the visit, as "16:40". */
  attendedAtLabel: string;
  /** What the anaesthetist was told or found. */
  reason: string;
}

const line = (v: string | null | undefined, fallback: string) =>
  (v && v.trim()) || fallback;

/** One WhatsApp message. Plain text; WhatsApp renders *bold* itself. */
export function buildPatientAbsentMessage(input: PatientAbsentMessageInput): string {
  const patient = line(input.patientName, 'Your patient');
  const folder = input.folderNumber ? ` (${input.folderNumber})` : '';
  const who = line(input.attendedByName, 'The anaesthetist on the case');
  const time = input.scheduledTime ? `, ${input.scheduledTime}` : '';

  const lines: string[] = [];

  lines.push(`Dear ${line(input.recipientName, 'Colleague')},`);
  lines.push('');
  lines.push('*PATIENT NOT IN THE WARD FOR PRE-OPERATIVE ANAESTHETIC REVIEW*');
  lines.push('');
  lines.push(
    `${who} went to review ${patient}${folder} at ${input.attendedAtLabel} today for `
    + `${line(input.procedureName, 'the listed procedure')}, listed for ${input.surgeryDay}${time}.`,
  );
  lines.push('');
  lines.push(
    input.ward
      ? `The patient was not in ${input.ward}. ${input.reason}`
      : `The patient was not in the ward the case names. ${input.reason}`,
  );
  lines.push('');
  lines.push(
    'The review cannot be completed without seeing the patient. Nobody can be declared '
    + 'fit for anaesthesia unheard and unexamined, so the case currently stands on the '
    + 'list with no review against it.',
  );
  lines.push('');
  lines.push('*One of three things is true, and only your team knows which:*');
  lines.push('');
  lines.push('1. The patient is admitted but was elsewhere — please say where and when they will be back on the ward.');
  lines.push('2. The patient has not been admitted — please admit them this evening so the review can be done before the list.');
  lines.push('3. It is a day case — please say so, and the review will be arranged in the holding area before the start.');
  lines.push('');
  lines.push(
    'A reply with which one it is, is all that is needed. The visit has been recorded on '
    + 'the ORM against this case, so the morning team can see why there is no review on it.',
  );

  return lines.join('\n');
}

/** The same facts, short enough for a dashboard notification. */
export function buildPatientAbsentNotice(input: PatientAbsentMessageInput): string {
  const patient = line(input.patientName, 'A patient');
  const folder = input.folderNumber ? ` (${input.folderNumber})` : '';
  return `${line(input.attendedByName, 'An anaesthetist')} went to review ${patient}${folder} `
    + `at ${input.attendedAtLabel} for ${line(input.procedureName, 'the listed procedure')} on `
    + `${input.surgeryDay} and the patient was not in the ward. ${input.reason} `
    + 'The review cannot be done until the patient is produced, or the case is declared a '
    + 'day case so it can be reviewed in the holding area.';
}
