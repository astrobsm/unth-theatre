// Builds a standardised, human-readable emergency surgery alert message that is
// broadcast to theatre staff (TV display, notifications, radio) the moment an
// emergency case is booked or submitted. Keeping the format in one place ensures
// every emergency alert reads consistently regardless of which booking flow
// created it.

export interface EmergencyAlertInput {
  patientName: string;
  folderNumber?: string | null;
  age?: number | null;
  gender?: string | null;
  procedureName: string;
  surgicalUnit?: string | null;
  indication?: string | null;
  surgeonName?: string | null;
  anaesthetistName?: string | null;
  theatreName?: string | null;
  /** Pre-formatted start time, e.g. "14:30". */
  estimatedStartTime?: string | null;
  priority?: string | null;
  bloodRequired?: boolean | null;
  bloodUnits?: number | null;
  bloodType?: string | null;
  specialEquipment?: string | null;
  /** LOCAL | REGIONAL | SPINAL | EPIDURAL | GENERAL | SEDATION | NONE */
  anaesthesiaType?: string | null;
}

function genderShort(gender?: string | null): string {
  if (!gender) return '';
  const g = gender.trim().toUpperCase();
  if (g.startsWith('M')) return 'M';
  if (g.startsWith('F')) return 'F';
  return gender.trim();
}

/**
 * Returns a multi-line emergency alert message suitable for TV display, push
 * notifications and printed handovers.
 */
export function buildEmergencyAlertMessage(input: EmergencyAlertInput): string {
  const priority = (input.priority || 'CRITICAL').toUpperCase();
  const ageGender = [
    input.age != null ? `${input.age}` : '',
    genderShort(input.gender),
  ]
    .filter(Boolean)
    .join('');

  const patientLine = [
    input.patientName,
    input.folderNumber ? `(Folder ${input.folderNumber})` : '',
    ageGender ? `· ${ageGender}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const lines: string[] = [];
  lines.push('🚨 EMERGENCY SURGERY ALERT 🚨');
  lines.push(`Priority: ${priority}`);
  lines.push(`Patient: ${patientLine}`);
  lines.push(`Procedure: ${input.procedureName}`);
  if (input.surgicalUnit) lines.push(`Unit: ${input.surgicalUnit}`);
  if (input.indication) lines.push(`Indication: ${input.indication}`);
  if (input.surgeonName) lines.push(`Surgeon: ${input.surgeonName}`);
  if (input.anaesthetistName) lines.push(`Anaesthetist: ${input.anaesthetistName}`);
  if (input.theatreName) lines.push(`Theatre: ${input.theatreName}`);
  if (input.estimatedStartTime) lines.push(`Estimated start: ${input.estimatedStartTime}`);

  if (input.anaesthesiaType) {
    const at = input.anaesthesiaType.toUpperCase();
    const note =
      at === 'LOCAL' || at === 'NONE'
        ? `${at} — no anaesthetist review required`
        : at;
    lines.push(`Anaesthesia: ${note}`);
  }

  if (input.bloodRequired) {
    const parts = [
      input.bloodUnits ? `${input.bloodUnits} unit(s)` : '',
      input.bloodType || '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(`Blood required: ${parts || 'yes'}`);
  }

  if (input.specialEquipment) lines.push(`Special equipment: ${input.specialEquipment}`);

  lines.push(
    'ALL theatre staff — anaesthetist, scrub nurse, recovery nurse, anaesthetic technician, ' +
      'store keeper, porter, blood bank, pharmacy and consumable pack provider — please respond immediately.'
  );

  return lines.join('\n');
}

/** A short single-line variant for radio/SMS where space is tight. */
export function buildEmergencyAlertSummary(input: EmergencyAlertInput): string {
  const priority = (input.priority || 'CRITICAL').toUpperCase();
  const parts = [
    `${priority} EMERGENCY:`,
    input.procedureName,
    `for ${input.patientName}`,
    input.folderNumber ? `(folder ${input.folderNumber})` : '',
    input.indication ? `— ${input.indication}` : '',
    input.estimatedStartTime ? `Start ${input.estimatedStartTime}.` : '',
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
