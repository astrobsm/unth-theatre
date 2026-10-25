// ============================================================
// What the hospital cannot supply
// ------------------------------------------------------------
// The deposit notice tells wards to stop handing patients prescriptions,
// because the hospital now supplies drugs and consumables. This is the
// exception to that, and it only exists because sometimes the shelf is
// genuinely empty.
//
// THE TWO RULES THAT MAKE THE EXCEPTION SAFE:
//
//   It lists ONLY what was marked out of stock. A slip that also carries
//   items the hospital does have sends a patient to buy things twice.
//
//   It carries the RETURN INSTRUCTION every time, not as a footnote. Goods
//   bought outside go back to pharmacy to be checked before they are used:
//   that is the whole safeguard against a counterfeit or a wrong strength
//   arriving in theatre in a patient's bag. A slip that omits it is worse
//   than no slip, because it looks official.
// ============================================================

export interface OutsideItem {
  name: string;
  size?: string | null;
  quantity: number;
  /** Pharmacy dispenses it, as opposed to the consumable store. */
  dispensedByPharmacy: boolean;
}

export interface OutsideSlip {
  patientName: string;
  folderNumber: string | null;
  procedure: string | null;
  surgeryDate: string | null;
  items: OutsideItem[];
  issuedByName: string | null;
  issuedAt: Date;
}

/** Printed in full on every slip. Not a footnote, and not optional. */
export const RETURN_INSTRUCTION =
  'ANYTHING BOUGHT OUTSIDE MUST BE BROUGHT TO PHARMACY TO BE CHECKED BEFORE IT IS USED. Do not take it straight to theatre.';

export const WARD_INSTRUCTION =
  'Hand this to the nurse looking after the patient on the ward.';

export interface SlipLine {
  text: string;
  /** Rendered large and bold on the thermal print. */
  emphasis?: boolean;
}

/** Characters that fit across 80mm thermal paper at the usual font. */
export const THERMAL_WIDTH = 42;

/**
 * Build the slip, line by line, as plain text.
 *
 * Plain text because an 80mm thermal printer is a character device: a slip
 * laid out in HTML and sent to one comes out as whatever the driver decided
 * to do with it, which differs between the three printers in this hospital.
 */
export function renderSlip(slip: OutsideSlip): SlipLine[] {
  const lines: SlipLine[] = [];
  const rule = () => lines.push({ text: '-'.repeat(THERMAL_WIDTH) });

  lines.push({ text: 'UNTH ITUKU-OZALLA', emphasis: true });
  lines.push({ text: 'THEATRE — ITEMS TO BUY OUTSIDE', emphasis: true });
  rule();

  lines.push({ text: `Patient: ${slip.patientName}` });
  if (slip.folderNumber) lines.push({ text: `Folder:  ${slip.folderNumber}` });
  if (slip.procedure) lines.push({ text: `For:     ${slip.procedure}` });
  if (slip.surgeryDate) lines.push({ text: `Surgery: ${slip.surgeryDate}` });
  rule();

  if (slip.items.length === 0) {
    // Should never print, but a slip that silently lists nothing would be
    // handed over and believed.
    lines.push({ text: 'NOTHING OUTSTANDING — DO NOT ISSUE', emphasis: true });
    return lines;
  }

  for (const item of slip.items) {
    const name = item.size ? `${item.name} ${item.size}` : item.name;
    lines.push({ text: `${item.quantity} x ${name}` });
    // Said per line, because a patient holding the slip at a pharmacy
    // counter does not know which of these is a drug.
    if (item.dispensedByPharmacy) lines.push({ text: '    (drug — from a pharmacy)' });
  }

  rule();
  lines.push({ text: RETURN_INSTRUCTION, emphasis: true });
  rule();
  lines.push({ text: WARD_INSTRUCTION });
  if (slip.issuedByName) lines.push({ text: `Issued by: ${slip.issuedByName}` });
  lines.push({ text: `Issued:    ${formatWhen(slip.issuedAt)}` });

  return lines;
}

/** Day and time, in the form a ward clerk reads without converting anything. */
export function formatWhen(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // WAT is UTC+1 all year, so this needs no timezone library and no DST.
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  return (
    `${pad(wat.getUTCDate())}/${pad(wat.getUTCMonth() + 1)}/${wat.getUTCFullYear()} ` +
    `${pad(wat.getUTCHours())}:${pad(wat.getUTCMinutes())}`
  );
}

/**
 * Whether this slip may be issued at all.
 *
 * Refuses an empty one. A slip with no items is handed over, believed, and
 * sends somebody to a pharmacy to buy nothing.
 */
export function canIssue(items: OutsideItem[]): boolean {
  return items.length > 0 && items.every((i) => i.quantity > 0);
}
