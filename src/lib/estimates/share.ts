// ============================================================
// Sharing an estimate with a patient
// ------------------------------------------------------------
// WhatsApp is how families in Enugu actually receive documents, so it is the
// route that matters. Two deliberate limits:
//
// 1. WhatsApp's click-to-chat link cannot carry an attachment. Only text. So the
//    message carries the FIGURES and a link, and the PDF is shared separately by
//    the person if they want to. Pretending otherwise would produce a "share"
//    button that silently sends nothing useful.
//
// 2. The message never contains a diagnosis. A WhatsApp message is forwarded,
//    read over a shoulder, and backed up to somebody's cloud account. Cost
//    information is what the family asked for; the clinical detail is not
//    needed to answer it.
// ============================================================

/**
 * Nigerian mobile numbers to WhatsApp's expected form: country code, no plus,
 * no spaces.
 *
 * Staff type these six different ways, and wa.me silently fails on most of
 * them — it opens a chat with nobody rather than reporting an error, which looks
 * exactly like a message that was sent.
 */
export function toWhatsAppNumber(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  // 08012345678 -> 2348012345678
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`;
  // 8012345678 -> 2348012345678
  if (digits.length === 10 && !digits.startsWith('0')) return `234${digits}`;
  // Already 234...
  if (digits.length === 13 && digits.startsWith('234')) return digits;
  // 002348012345678 or similar international prefixes
  if (digits.length > 13 && digits.includes('234')) {
    const from = digits.indexOf('234');
    const rest = digits.slice(from);
    if (rest.length === 13) return rest;
  }
  // A plausible foreign number, left alone rather than mangled into a Nigerian one.
  if (digits.length >= 11 && digits.length <= 15) return digits;

  return null;
}

export interface ShareMessageInput {
  estimateNumber: string;
  patientName: string;
  procedureName: string;
  totalKobo: number;
  depositKobo: number;
  plannedDate?: Date | string | null;
  validUntil?: Date | string | null;
  /** Absolute URL where the estimate can be viewed. */
  viewUrl?: string | null;
  hospitalName?: string;
}

const naira = (kobo: number): string => {
  const n = Math.trunc(kobo / 100);
  const k = Math.abs(kobo % 100);
  return `NGN ${n.toLocaleString('en-NG')}.${String(k).padStart(2, '0')}`;
};

const day = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * The message text.
 *
 * Written to be read on a phone by someone who is worried about money: the
 * figure first, then what it covers, then what to do next. No clinical detail,
 * and it says plainly that this is an estimate rather than a bill — because the
 * commonest complaint about hospital costing is a family who budgeted for a
 * number they were told was final.
 */
export function buildShareMessage(input: ShareMessageInput): string {
  const lines: string[] = [];
  const hospital = input.hospitalName ?? 'UNTH Ituku-Ozalla';

  lines.push(`${hospital} — Theatre Complex`);
  lines.push(`Cost estimate ${input.estimateNumber}`);
  lines.push('');
  lines.push(`Patient: ${input.patientName}`);
  lines.push(`Procedure: ${input.procedureName}`);

  const on = day(input.plannedDate);
  if (on) lines.push(`Planned date: ${on}`);

  lines.push('');
  lines.push(`ESTIMATED TOTAL: ${naira(input.totalKobo)}`);
  if (input.depositKobo > 0) {
    lines.push(`Deposit before surgery: ${naira(input.depositKobo)}`);
  }

  const until = day(input.validUntil);
  if (until) {
    lines.push('');
    lines.push(`These prices are held until ${until}.`);
  }

  lines.push('');
  lines.push('This is an ESTIMATE, not a bill. The final amount may change if the operation, the length of stay, or the materials needed change. Emergency care, complications and intensive care are not included.');

  if (input.viewUrl) {
    lines.push('');
    lines.push(`Full breakdown: ${input.viewUrl}`);
  }

  lines.push('');
  lines.push('Please bring this reference to the finance office. If anything here is unclear, ask the ward nurse or the theatre office.');

  return lines.join('\n');
}

/**
 * The wa.me link.
 *
 * Returns null for an unusable number rather than a link that opens an empty
 * chat — a share button that appears to work but reaches nobody is worse than
 * one that says the number is wrong.
 */
export function whatsAppShareUrl(
  phone: string,
  message: string
): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
