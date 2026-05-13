// Generate a WhatsApp click-to-chat link (wa.me) for sending an out-of-stock
// alternative request to a prescriber. Phone numbers are normalised to the
// international format expected by wa.me (digits only, leading country code).
// Defaults to Nigeria (+234) when a local 0-prefixed number is supplied.

const DEFAULT_COUNTRY_CODE = "234"; // Nigeria

export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let p = input.replace(/[^\d+]/g, "");
  if (!p) return null;
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = DEFAULT_COUNTRY_CODE + p.slice(1);
  // If no country code prefix detected, prepend the default
  if (p.length <= 10) p = DEFAULT_COUNTRY_CODE + p;
  return p;
}

export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const n = normalisePhone(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

export function buildOutOfStockWhatsAppMessage(opts: {
  patientName: string;
  procedureName?: string | null;
  outOfStockItems: string[];
  hospitalName?: string;
}): string {
  const lines = [
    `🏥 ${opts.hospitalName || "UNTH Theatre Pharmacy"}`,
    `Hello, the following item(s) on the prescription for *${opts.patientName}*${
      opts.procedureName ? ` (${opts.procedureName})` : ""
    } are *out of stock*:`,
    ...opts.outOfStockItems.map((d) => `• ${d}`),
    ``,
    `Kindly suggest available alternatives so we can complete the pack.`,
    `— Theatre Pharmacy`,
  ];
  return lines.join("\n");
}
