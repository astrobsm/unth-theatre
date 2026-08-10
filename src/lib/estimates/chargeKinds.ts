// The ChargeKind vocabulary, as a value the import validator and the UI can
// both read. Prisma generates the enum as a type only, and a bulk upload has
// to tell an administrator which kinds are acceptable — so the list has to
// exist at runtime, in exactly one place.
export const CHARGE_KINDS = [
  'PROCEDURE', 'THEATRE', 'ANAESTHESIA', 'CONSUMABLE', 'DRUG', 'IMPLANT',
  'CSSD', 'RECOVERY', 'LABORATORY', 'BLOOD', 'OXYGEN', 'EMERGENCY',
  'ADMISSION', 'NURSING', 'POSTOP_SERVICE', 'OTHER',
] as const;

export type ChargeKind = (typeof CHARGE_KINDS)[number];

/** What an administrator sees in the upload guidance. */
export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  PROCEDURE: "Surgeon's professional fee",
  THEATRE: 'Theatre / procedure charge',
  ANAESTHESIA: "Anaesthetist's professional fee",
  CONSUMABLE: 'Surgical consumable or material',
  DRUG: 'Medication',
  IMPLANT: 'Implant or prosthesis',
  CSSD: 'Sterilisation',
  RECOVERY: 'Recovery / PACU',
  LABORATORY: 'Laboratory or imaging investigation',
  BLOOD: 'Blood product',
  OXYGEN: 'Oxygen',
  EMERGENCY: 'Emergency surcharge',
  ADMISSION: 'Daily admission / bed charge (needs a ward)',
  NURSING: 'Nursing charge',
  POSTOP_SERVICE: 'Post-operative service (dressing, physiotherapy)',
  OTHER: 'Other approved charge',
};
