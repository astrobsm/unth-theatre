/**
 * The seam between the number we store and the link WhatsApp opens.
 *
 * Two helpers meet here and neither knows about the other. `toWhatsAppNumber`
 * turns whatever a member of staff typed into their profile into the form the
 * Business API wants; `whatsappLink` turns a number into a wa.me URL and
 * normalises it again on the way. A disagreement between them does not throw
 * and does not log — it opens a chat with a number that is almost right, and
 * the head of department simply never hears anything.
 *
 * The chase buttons across this application all run through this pair, so the
 * composition is tested rather than either half on its own.
 */
import { describe, expect, it } from 'vitest';

import { toWhatsAppNumber } from '../../src/lib/comms/whatsapp';
import { normalisePhone, whatsappLink } from '../../src/lib/whatsapp';

/** What a chase button actually does: store-format, then link. */
const linkFor = (typed: string) => {
  const n = toWhatsAppNumber(typed);
  return n ? whatsappLink(n, 'hello') : null;
};

describe('a Nigerian number, however it was typed into a profile', () => {
  const expected = 'https://wa.me/2348033328385';

  it('reaches the same chat from every spelling', () => {
    for (const typed of [
      '08033328385',
      '8033328385',
      '2348033328385',
      '+234 803 332 8385',
      '+234-803-332-8385',
      '0803 332 8385',
    ]) {
      const link = linkFor(typed);
      expect(link, typed).not.toBeNull();
      expect(link!.startsWith(expected), `${typed} -> ${link}`).toBe(true);
    }
  });

  it('does not lose or double the country code on the second pass', () => {
    // whatsappLink normalises again, so a number already carrying 234 must
    // not come out as 234234…. That mistake dials a real but wrong number.
    const stored = toWhatsAppNumber('08033328385')!;
    expect(stored).toBe('2348033328385');
    expect(normalisePhone(stored)).toBe('2348033328385');
  });
});

describe('a number that cannot be used', () => {
  it('gives no link rather than a broken one', () => {
    // The caller shows "no phone number on file" on a null. A wa.me URL built
    // from rubbish opens WhatsApp on an invalid-number error, which reads to
    // the person pressing it as though the message went somewhere.
    for (const typed of ['', '   ', 'not a number', '-', '()']) {
      expect(linkFor(typed), typed).toBeNull();
    }
  });
});

describe('the message that travels with the link', () => {
  it('survives newlines, ampersands and the characters a letter contains', () => {
    const text = 'Dear Dr Okafor,\n\nThe roster for 1–30 November is outstanding.\n'
      + 'Please publish it — Theatre Management & the CMAC have been copied.';
    const link = whatsappLink('08033328385', text)!;

    const sent = decodeURIComponent(new URL(link).searchParams.get('text')!);
    expect(sent).toBe(text);
    // A raw newline or ampersand in the query string truncates the message at
    // that character, so the head of department reads half a sentence.
    expect(link).not.toContain('\n');
    expect(link.split('?')[1].startsWith('text=')).toBe(true);
    expect(link.split('?')[1].indexOf('&')).toBe(-1);
  });
});
