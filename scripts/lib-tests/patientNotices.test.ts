// What the hospital says to a patient on their own phone.
//
// Two things are being held here, and they pull in opposite directions.
//
// The message must SAY SOMETHING. A delay notice with no horizon, a
// cancellation with no instruction about eating, a payment warning with no
// amount — each of those is a message that costs the patient the trouble of
// reading it and leaves them exactly where they were. So the builder refuses
// to produce one.
//
// And the message must GIVE NOTHING AWAY. It goes to a phone that is shared,
// read over a shoulder and backed up to somebody's cloud account, and one wrong
// digit at booking puts it in a stranger's hand. So there is no route by which
// a diagnosis can reach it: the reasons are a fixed list, and these tests check
// the list as well as the builder.
import { describe, it, expect } from 'vitest';
import {
  buildPatientNotice, depositSentence, reasonsFor, noticeAuditLine,
  DELAY_REASONS, CHANGE_REASONS, EATING_INSTRUCTIONS, TEMPLATE_FOR,
  type NoticeKind,
} from '../../src/lib/patients/notices';

const LINK = 'https://unth-theatre.link/f';
const base = { patientName: 'Adaeze Okafor', feedbackLink: LINK };

const ok = (r: ReturnType<typeof buildPatientNotice>) => {
  if (!r.ok) throw new Error(`expected a message, got: ${r.problem}`);
  return r;
};

describe('the safety notice', () => {
  it('needs nothing but a name', () => {
    const r = ok(buildPatientNotice({ ...base, kind: 'SAFETY' }));
    expect(r.text).toContain('Adaeze Okafor');
    expect(r.templateCode).toBe('PATIENT_SAFETY_NOTICE');
  });

  it('says who may give a list, and who may not', () => {
    const t = ok(buildPatientNotice({ ...base, kind: 'SAFETY' })).text;
    expect(t).toMatch(/ward/i);
    expect(t).toMatch(/pharmacist/i);
    expect(t).toMatch(/do not pay/i);
    // And that asking carries no penalty, which is the thing that actually
    // makes somebody report it.
    expect(t).toMatch(/not in any trouble/i);
  });

  it('carries the anonymous feedback link', () => {
    expect(ok(buildPatientNotice({ ...base, kind: 'SAFETY' })).text).toContain(LINK);
  });
});

describe('the payment warning', () => {
  it('refuses when the case has no deposit', () => {
    // THE REFUSAL THAT MATTERS HERE. Without it the message tells a patient to
    // go and pay an amount nobody has set, at a cashier who has no record of
    // them — and it does it over the hospital's name.
    const r = buildPatientNotice({ ...base, kind: 'PAYMENT_WARNING', deposit: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/no drug or consumable deposit/i);
  });

  it('names the amount and where it is paid', () => {
    const r = ok(buildPatientNotice({
      ...base, kind: 'PAYMENT_WARNING',
      deposit: depositSentence({ consumableAmount: '30000', pharmacyAmount: '17500' }),
    }));
    expect(r.text).toContain('NGN 47,500.00');
    expect(r.text).toMatch(/revenue unit/i);
    // A patient who knows the figure cannot be quietly asked for more.
    expect(r.text).toMatch(/NGN 17,500\.00/);
    expect(r.text).toMatch(/NGN 30,000\.00/);
  });

  it('says plainly that paying a person is at the patient\'s own risk', () => {
    const t = ok(buildPatientNotice({
      ...base, kind: 'PAYMENT_WARNING', deposit: depositSentence({ pharmacyAmount: '5000' }),
    })).text;
    expect(t).toMatch(/at your own risk/i);
    expect(t).toMatch(/cannot be traced/i);
    expect(t).toMatch(/official receipt/i);
    // And does not leave them thinking it is their fault if it happens.
    expect(t).toMatch(/should not happen to you/i);
  });

  it('does not invent a total when the figures are not set', () => {
    // A deposit row with no amounts is a real state. "Your deposit is NGN 0.00"
    // would be worse than saying it is still being worked out.
    const s = depositSentence({ consumableAmount: null, pharmacyAmount: null });
    expect(s).not.toMatch(/0\.00/);
    expect(s).toMatch(/being worked out/i);
    // Zero and absent must not render the same way either.
    expect(depositSentence({ consumableAmount: '0', pharmacyAmount: null }))
      .toMatch(/being worked out/i);
  });

  it('handles one side only', () => {
    expect(depositSentence({ pharmacyAmount: '12000' })).toMatch(/medicines is NGN 12,000\.00/);
    expect(depositSentence({ consumableAmount: '12000' })).toMatch(/theatre items is NGN 12,000\.00/);
  });
});

describe('the delay notice', () => {
  it('refuses without a reason the patient may be given', () => {
    const r = buildPatientNotice({ ...base, kind: 'STILL_HOLDING', expected: 'within two hours' });
    expect(r.ok).toBe(false);
  });

  it('refuses without a horizon', () => {
    // They already know they are waiting. The only new information this
    // message can carry is until when.
    const r = buildPatientNotice({
      ...base, kind: 'STILL_HOLDING', reasonKey: 'CASE_OVERRAN', expected: '  ',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/when you expect/i);
  });

  it('reassures that the patient has not been dropped', () => {
    const t = ok(buildPatientNotice({
      ...base, kind: 'STILL_HOLDING', reasonKey: 'CASE_OVERRAN',
      expected: 'within the next two hours',
    })).text;
    expect(t).toMatch(/not been forgotten/i);
    expect(t).toMatch(/still going ahead/i);
    expect(t).toContain('within the next two hours');
    expect(t).toMatch(/sorry/i);
  });

  it('rejects a reason that is not on the list', () => {
    // The guard against free text. An unknown key is refused rather than
    // passed through as the message body.
    const r = buildPatientNotice({
      ...base, kind: 'STILL_HOLDING',
      reasonKey: 'waiting for the HIV result', expected: 'soon',
    });
    expect(r.ok).toBe(false);
  });
});

describe('a new date, or none', () => {
  it('refuses a reschedule with no date', () => {
    const r = buildPatientNotice({
      ...base, kind: 'RESCHEDULED', reasonKey: 'LIST_OVERRAN',
      instructionKey: 'FAST_FROM_MIDNIGHT',
    });
    expect(r.ok).toBe(false);
  });

  it('refuses a change with no eating instruction', () => {
    // THE COMMONEST REAL HARM from a late change: nobody tells the patient
    // whether fasting still applies, so they either starve for nothing or eat
    // before an operation that is still on.
    for (const kind of ['RESCHEDULED', 'CANCELLED'] as NoticeKind[]) {
      const r = buildPatientNotice({
        ...base, kind, reasonKey: 'LIST_OVERRAN', newDate: 'Monday 16 November',
      });
      expect(r.ok, kind).toBe(false);
      if (!r.ok) expect(r.problem).toMatch(/eating and drinking/i);
    }
  });

  it('carries the new date and the instruction', () => {
    const t = ok(buildPatientNotice({
      ...base, kind: 'RESCHEDULED', reasonKey: 'EMERGENCY_TOOK_PRIORITY',
      newDate: 'Monday 16 November, come to the ward by 7 a.m.',
      instructionKey: 'FAST_FROM_MIDNIGHT',
    })).text;
    expect(t).toContain('Monday 16 November');
    expect(t).toMatch(/do not eat/i);
    expect(t).toMatch(/plain water/i);
    expect(t).toMatch(/emergency/i);
  });

  it('tells a cancelled patient they may eat again, and are still in care', () => {
    const t = ok(buildPatientNotice({
      ...base, kind: 'CANCELLED', reasonKey: 'BED_UNAVAILABLE',
      instructionKey: 'EAT_NORMALLY',
    })).text;
    expect(t).toMatch(/eat and drink normally/i);
    expect(t).toMatch(/remain under their care/i);
    expect(t).toMatch(/not leave the ward/i);
    expect(t).toMatch(/very sorry/i);
  });
});

describe('what the patient may be told', () => {
  it('offers no reason that discloses a condition', () => {
    // The whole reason the reasons are a list. Every entry has to be sayable to
    // a stranger holding the patient's phone.
    const CLINICAL = /\b(diagnos|HIV|hepatit|cancer|tumou?r|malignan|haemoglobin|hemoglobin|biops|histolog|infect|sepsis|anaemi|anemi)\b/i;
    for (const c of [...DELAY_REASONS, ...CHANGE_REASONS, ...EATING_INSTRUCTIONS]) {
      expect(c.patientWords, c.key).not.toMatch(CLINICAL);
    }
  });

  it('has a way to say "clinical" without saying which', () => {
    // There has to be an honest option for the case where the real reason IS
    // the patient's condition. Without one, somebody picks a reason that is
    // untrue, and the patient is misled rather than merely not told.
    expect(DELAY_REASONS.some((r) => r.key === 'FURTHER_PREPARATION')).toBe(true);
    expect(CHANGE_REASONS.some((r) => r.key === 'FURTHER_PREPARATION')).toBe(true);
  });

  it('sends every eating instruction back to the ward', () => {
    // Fasting advice is clinical advice, and this module cannot know that a
    // particular patient is diabetic or on a drip.
    for (const i of EATING_INSTRUCTIONS) {
      expect(i.patientWords, i.key).toMatch(/nurse/i);
    }
  });

  it('draws reasons from the right list for each kind', () => {
    expect(reasonsFor('SAFETY')).toEqual([]);
    expect(reasonsFor('PAYMENT_WARNING')).toEqual([]);
    expect(reasonsFor('STILL_HOLDING')).toBe(DELAY_REASONS);
    expect(reasonsFor('RESCHEDULED')).toBe(CHANGE_REASONS);
    expect(reasonsFor('CANCELLED')).toBe(CHANGE_REASONS);
  });

  it('has a template for every kind', () => {
    for (const kind of Object.keys(TEMPLATE_FOR) as NoticeKind[]) {
      expect(TEMPLATE_FOR[kind], kind).toBeTruthy();
    }
  });
});

describe('the record of what was said', () => {
  it('names who was told and what they were told', () => {
    const line = noticeAuditLine('CANCELLED', 'Chidi Okafor (next of kin)');
    expect(line).toContain('Chidi Okafor');
    expect(line).toMatch(/will not go ahead/i);
  });

  it('refuses to address a patient with no name', () => {
    const r = buildPatientNotice({ ...base, patientName: '  ', kind: 'SAFETY' });
    expect(r.ok).toBe(false);
  });

  it('refuses when there is no feedback link to include', () => {
    // The link is in every template body. Rendering would leave a visible
    // {{feedbackLink}} in a message to a patient.
    const r = buildPatientNotice({ ...base, feedbackLink: '', kind: 'SAFETY' });
    expect(r.ok).toBe(false);
  });
});
