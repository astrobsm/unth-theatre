import { describe, it, expect } from 'vitest';
import {
  toWhatsAppNumber, buildShareMessage, whatsAppShareUrl,
} from '../../src/lib/estimates/share';

describe('toWhatsAppNumber', () => {
  it('converts a local 11-digit number', () => {
    expect(toWhatsAppNumber('08012345678')).toBe('2348012345678');
  });

  it('handles the spaces and dashes staff actually type', () => {
    // wa.me fails silently on these — it opens a chat with nobody, which looks
    // exactly like a message that was sent.
    expect(toWhatsAppNumber('0801 234 5678')).toBe('2348012345678');
    expect(toWhatsAppNumber('0801-234-5678')).toBe('2348012345678');
    expect(toWhatsAppNumber('+234 801 234 5678')).toBe('2348012345678');
  });

  it('accepts a number already in international form', () => {
    expect(toWhatsAppNumber('2348012345678')).toBe('2348012345678');
  });

  it('adds the country code to a 10-digit number', () => {
    expect(toWhatsAppNumber('8012345678')).toBe('2348012345678');
  });

  it('strips a 00 international prefix', () => {
    expect(toWhatsAppNumber('002348012345678')).toBe('2348012345678');
  });

  it('leaves a plausible foreign number alone rather than mangling it', () => {
    // Patients do have relatives abroad paying the bill.
    expect(toWhatsAppNumber('+44 7700 900123')).toBe('447700900123');
  });

  it('returns null for junk', () => {
    // Null so the caller can say "check the number" instead of opening an empty
    // chat that reaches nobody.
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('abc')).toBeNull();
    expect(toWhatsAppNumber('12345')).toBeNull();
  });
});

describe('buildShareMessage', () => {
  const base = {
    estimateNumber: 'EST-2026-000124',
    patientName: 'OBILOR MMESOMA CLARA',
    procedureName: 'Herniorrhaphy',
    totalKobo: 4_205_000_0,
    depositKobo: 2_102_500_0,
  };

  it('leads with the figure a family is asking about', () => {
    const m = buildShareMessage(base);
    expect(m).toContain('ESTIMATED TOTAL: NGN 420,500.00');
    expect(m).toContain('Deposit before surgery: NGN 210,250.00');
  });

  it('says plainly that it is not a bill', () => {
    // The commonest complaint about hospital costing is a family who budgeted
    // for a number they were told was final.
    expect(buildShareMessage(base)).toMatch(/ESTIMATE, not a bill/);
  });

  it('states what is excluded', () => {
    const m = buildShareMessage(base);
    expect(m).toMatch(/Emergency care, complications and intensive care are not included/);
  });

  it('never includes a diagnosis', () => {
    // A WhatsApp message is forwarded, read over a shoulder and backed up to
    // somebody's cloud account. Cost is what was asked for; the clinical detail
    // is not needed to answer it.
    const m = buildShareMessage({ ...base, procedureName: 'Herniorrhaphy' });
    expect(m).not.toContain('diagnosis');
    expect(m).not.toContain('Diagnosis');
  });

  it('omits the deposit line when there is no deposit', () => {
    expect(buildShareMessage({ ...base, depositKobo: 0 }))
      .not.toContain('Deposit before surgery');
  });

  it('includes the planned date when known', () => {
    expect(buildShareMessage({ ...base, plannedDate: '2026-08-20T00:00:00Z' }))
      .toContain('Planned date: 2026-08-20');
  });

  it('omits an unparseable date rather than printing Invalid Date', () => {
    expect(buildShareMessage({ ...base, plannedDate: 'rubbish' }))
      .not.toContain('Invalid');
  });

  it('includes the validity date when the prices are held', () => {
    expect(buildShareMessage({ ...base, validUntil: '2026-09-30T00:00:00Z' }))
      .toContain('held until 2026-09-30');
  });

  it('includes the breakdown link when given', () => {
    expect(buildShareMessage({ ...base, viewUrl: 'https://unth-theatre.link/e/abc' }))
      .toContain('https://unth-theatre.link/e/abc');
  });

  it('carries the estimate reference so finance can find it', () => {
    expect(buildShareMessage(base)).toContain('EST-2026-000124');
  });

  it('uses NGN rather than the naira sign', () => {
    // Not for font reasons here but for delivery: the sign renders as a box on
    // some older Android keyboards and WhatsApp builds.
    expect(buildShareMessage(base)).not.toContain('₦');
  });
});

describe('whatsAppShareUrl', () => {
  it('builds a wa.me link with the message encoded', () => {
    const url = whatsAppShareUrl('08012345678', 'Hello there');
    expect(url).toBe('https://wa.me/2348012345678?text=Hello%20there');
  });

  it('encodes newlines so the message keeps its shape', () => {
    const url = whatsAppShareUrl('08012345678', 'Line one\nLine two');
    expect(url).toContain('Line%20one%0ALine%20two');
  });

  it('returns null for an unusable number', () => {
    // Better to tell the user the number is wrong than to open a chat with
    // nobody and let them believe it was sent.
    expect(whatsAppShareUrl('nonsense', 'hi')).toBeNull();
  });
});
