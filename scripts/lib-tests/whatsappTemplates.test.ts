/**
 * Would Meta accept these, and do they say what we think they say?
 *
 * A rejected WhatsApp template is not a quick fix. It is a resubmission and
 * another wait, and the reason Meta returns is often no more specific than
 * "does not follow our guidelines" — so a mechanical mistake can cost a day to
 * identify. Every rule Meta publishes that can be checked from here is checked
 * here, before anybody spends a submission on it.
 *
 * The subtler failure this also guards is a MISMATCH between the two bodies.
 * Each template is written twice: once with Meta's positional {{1}} {{2}}, and
 * once with ORM's named {{name}} {{date}}. The positional one is what the
 * recipient reads; the named one is what the app records and shows in its own
 * history. If they drift, the hospital's record of what it told somebody stops
 * matching what it actually sent — which, for messages whose whole purpose is
 * to establish that a team was warned, is the one thing that must not happen.
 */
import { describe, expect, it } from 'vitest';

import { WHATSAPP_TEMPLATES, validateTemplate, templateByCode } from '../../src/lib/comms/templates';

describe('WhatsApp templates', () => {
  it('has templates at all', () => {
    // Guards the suite: every assertion below is vacuous on an empty list.
    expect(WHATSAPP_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('every template satisfies the rules Meta will apply', () => {
    // Reported all at once and by name, because meeting this failure one
    // template at a time is how a submission session takes an afternoon.
    const failures = WHATSAPP_TEMPLATES
      .map((t) => ({ code: t.code, problems: validateTemplate(t) }))
      .filter((r) => r.problems.length)
      .map((r) => `${r.code}: ${r.problems.join(' ')}`);

    expect(failures).toEqual([]);
  });

  it('gives every template a unique code and a unique Meta name', () => {
    // Two rows with one code makes "which one was sent" unanswerable, and Meta
    // keys by name so a duplicate silently overwrites the wrong one.
    const codes = WHATSAPP_TEMPLATES.map((t) => t.code);
    const names = WHATSAPP_TEMPLATES.map((t) => t.metaName);
    expect(codes.length).toBe(new Set(codes).size);
    expect(names.length).toBe(new Set(names).size);
  });

  it('never puts clinical detail or a patient name in a template', () => {
    // checkSendAllowed refuses clinical content on an external channel, but it
    // can only judge the sensitivity flag it is given. This checks the words.
    //
    // A WhatsApp message sits unencrypted in a notification shade, on a train,
    // on a lock screen. What is outstanding and where to fix it is operational;
    // who the patient is and what is wrong with them is not, and the link is
    // what carries the reader to the detail behind a login.
    const forbidden = [
      /\bpatient(?:'s)? name\b/i,
      /\bdiagnos/i,
      /\bhiv\b/i, /\bhepatitis\b/i,
      /\bmalignan/i, /\bcarcinoma\b/i, /\btumour\b/i, /\btumor\b/i,
    ];
    const offenders: string[] = [];
    for (const t of WHATSAPP_TEMPLATES) {
      for (const re of forbidden) {
        if (re.test(t.metaBody)) offenders.push(`${t.code} matches ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is UTILITY, never MARKETING', () => {
    // Mislabelling gets the whole WhatsApp Business account restricted, not the
    // one template rejected. These concern work the recipient has already
    // undertaken, which is exactly what UTILITY means.
    expect(WHATSAPP_TEMPLATES.every((t) => t.category === 'UTILITY')).toBe(true);
  });

  it('escalates in firmness without becoming an accusation', () => {
    // The emergency ladder is the one that could sour the whole system. It must
    // get firmer, and it must stay civil: a message that reads as a threat gets
    // the sender muted, and then the message that mattered does not arrive
    // either.
    const ladder = ['EMERGENCY_NOT_STARTED_30', 'EMERGENCY_NOT_STARTED_60', 'EMERGENCY_NOT_STARTED_REPEAT']
      .map((c) => templateByCode(c));

    expect(ladder.every(Boolean)).toBe(true);

    // Every rung still addresses the person properly.
    for (const t of ladder) expect(t!.metaBody).toMatch(/^Dear /);

    // Only the later rungs carry the medicolegal point, so it lands when it is
    // meant to rather than being the opening line of the first nudge.
    expect(ladder[0]!.metaBody).not.toMatch(/medicolegal/i);
    expect(ladder[1]!.metaBody).toMatch(/medicolegal/i);

    // And none of them blames anybody.
    for (const t of ladder) {
      expect(t!.metaBody).not.toMatch(/\b(failed to|negligen|your fault|unacceptable)\b/i);
    }
  });

  it('tells the reader where to go', () => {
    // A reminder with nothing to tap is a reminder to do something later, which
    // is the behaviour being fixed. Every template carries a button.
    const noButton = WHATSAPP_TEMPLATES.filter((t) => !t.buttonLabel).map((t) => t.code);
    expect(noButton).toEqual([]);
  });

  it('says when each one fires, in words', () => {
    // Shown on the setup screen. An administrator deciding whether to switch
    // this on needs to know what will go out and when, without reading cron.
    const undocumented = WHATSAPP_TEMPLATES.filter((t) => (t.when ?? '').length < 20).map((t) => t.code);
    expect(undocumented).toEqual([]);
  });
});

describe('the template validator itself', () => {
  // The validator is the thing standing between a typo and a wasted day, so it
  // is worth proving it actually catches each rule rather than trusting that
  // the real templates pass.
  const base = {
    code: 'X', metaName: 'x', category: 'UTILITY' as const, language: 'en',
    when: 'A sufficiently long description of when this fires.',
    buttonLabel: 'Open',
  };

  it('catches a body that starts with a variable', () => {
    const problems = validateTemplate({
      ...base, metaBody: '{{1}} please review.', body: '{{name}} please review.',
      variables: ['name'],
    });
    expect(problems.join(' ')).toMatch(/starts with a variable/);
  });

  it('catches a body that ends with a variable', () => {
    const problems = validateTemplate({
      ...base, metaBody: 'Please review {{1}}', body: 'Please review {{name}}',
      variables: ['name'],
    });
    expect(problems.join(' ')).toMatch(/ends with a variable/);
  });

  it('catches adjacent variables', () => {
    const problems = validateTemplate({
      ...base, metaBody: 'Dear {{1}} {{2}}, please review.', body: 'Dear {{a}} {{b}}, please review.',
      variables: ['a', 'b'],
    });
    expect(problems.join(' ')).toMatch(/adjacent/);
  });

  it('catches placeholders that skip a number', () => {
    // {{1}} and {{3}} with two variables would send the second value into the
    // third slot, so the sentence reads correctly and says the wrong thing.
    const problems = validateTemplate({
      ...base, metaBody: 'Dear {{1}}, there are {{3}} items.', body: 'Dear {{a}}, there are {{b}} items.',
      variables: ['a', 'b'],
    });
    expect(problems.join(' ')).toMatch(/Placeholders are/);
  });

  it('catches the two bodies disagreeing', () => {
    const problems = validateTemplate({
      ...base, metaBody: 'Dear {{1}}, there are {{2}} items.',
      body: 'Dear {{a}}, there are {{different}} items.',
      variables: ['a', 'b'],
    });
    expect(problems.join(' ')).toMatch(/app-side body/);
  });

  it('passes a correct template', () => {
    expect(validateTemplate({
      ...base, metaBody: 'Dear {{1}}, there are {{2}} items outstanding.',
      body: 'Dear {{name}}, there are {{count}} items outstanding.',
      variables: ['name', 'count'],
    })).toEqual([]);
  });
});
