/**
 * The message a patient gets when their number is tapped on the theatre list.
 *
 * Four instructions have to survive, in order: go to the consumable shop at
 * the Emergency, pay the deposit for the category the operation is booked
 * under, keep the receipt, bring the receipt to the theatre on the day. Three
 * and four are the ones that get dropped when somebody types the message out
 * by hand, and they are the ones a case is held at the door over — the theatre
 * cannot see the shop's book, so the receipt IS how it knows the pack was paid
 * for.
 *
 * The other thing tested here is the one that would be embarrassing rather
 * than merely unhelpful: this message goes to a caregiver's phone as often as
 * to the patient's own, because that is what patientContact() falls back to,
 * and "you have materials to pay for" addressed to somebody's son is wrong in
 * a way that makes the hospital look careless.
 *
 * The names below are invented. Real patient names stay out of the repository.
 */
import { describe, expect, it } from 'vitest';
import {
  buildConsumableDepositMessage,
  buildShortDepositMessage,
  depositCategorySentence,
  procedureCategoryLabel,
  CONSUMABLE_SHOP,
} from '../../src/lib/packs/patientPayNotice';

const base = {
  patientName: 'Test Patient One',
  owner: 'PATIENT' as const,
  procedureName: 'Appendicectomy (paediatric)',
  category: 'MAJOR',
  scheduledAt: new Date(2026, 10, 23),
};

describe('the procedure category', () => {
  it('reads the magnitude the case was booked under', () => {
    expect(procedureCategoryLabel('MAJOR')).toBe('MAJOR');
    expect(procedureCategoryLabel('intermediate')).toBe('INTERMEDIATE');
  });

  it('writes SUPER_MAJOR in words, because the patient reads this', () => {
    expect(procedureCategoryLabel('SUPER_MAJOR')).toBe('SUPER MAJOR');
    expect(procedureCategoryLabel('super major')).toBe('SUPER MAJOR');
  });

  it('refuses to guess a category it does not recognise', () => {
    expect(procedureCategoryLabel('BIG')).toBeNull();
    expect(procedureCategoryLabel(null)).toBeNull();
    expect(procedureCategoryLabel('')).toBeNull();
  });

  it('names the category when the case carries one', () => {
    expect(depositCategorySentence('MAJOR')).toContain('MAJOR');
    expect(depositCategorySentence('MAJOR')).toContain('consumable deposit');
  });

  it('sends the patient to ask rather than inventing a figure', () => {
    // A patient told to pay the MAJOR deposit for an INTERMEDIATE case has
    // been given a figure by this hospital that this hospital will then
    // refuse, and they paid it on our word.
    const s = depositCategorySentence(null);
    expect(s).toContain('they will tell you the');
    expect(s).not.toContain('MAJOR');
  });
});

describe('the full message', () => {
  const msg = buildConsumableDepositMessage(base);

  it('names the shop, and names it as the Emergency one', () => {
    // "The consumable office" is a different door. A patient sent to the wrong
    // one on the day before surgery does not get a second attempt.
    expect(msg).toContain(CONSUMABLE_SHOP);
    expect(msg).toContain('EMERGENCY');
  });

  it('gives all four steps', () => {
    expect(msg).toContain('1. Go to');
    expect(msg).toContain('2. Pay the consumable deposit');
    expect(msg).toContain('KEEP THE EVIDENCE OF PAYMENT');
    expect(msg).toContain('BRING THAT RECEIPT TO THE THEATRE ON THE DAY OF THE SURGERY');
  });

  it('says why the receipt matters, not merely that it does', () => {
    // An instruction with no reason behind it is the one that gets ignored,
    // and this one is ignored at the theatre door.
    expect(msg).toContain('no way of seeing the shop');
    expect(msg).toContain('held at the door');
  });

  it('names the operation and the day', () => {
    expect(msg).toContain('Appendicectomy (paediatric)');
    expect(msg).toContain('Monday 23 November');
  });

  it('still carries the refusal of outside materials, and the reason', () => {
    expect(msg).toContain('cannot be used in the theatre');
    expect(msg).toContain('This is not about money');
    expect(msg).toContain('sterile wrapping');
  });

  it('tells somebody who already bought outside not to throw it away', () => {
    expect(msg).toContain('do not throw it away');
    expect(msg).toContain('theatre pharmacy');
  });

  it('offers help rather than only a demand', () => {
    expect(msg).toContain('If paying is difficult');
  });

  it('addresses the patient by name', () => {
    expect(msg).toContain('Good day, Test Patient One.');
    expect(msg).toContain('You are on the theatre list');
  });
});

describe('when the number belongs to somebody else', () => {
  const msg = buildConsumableDepositMessage({ ...base, owner: 'CAREGIVER' });

  it('writes about the patient in the third person', () => {
    expect(msg).toContain('Test Patient One is on the theatre list');
    expect(msg).not.toContain('You are on the theatre list');
  });

  it('says why they are the one being written to', () => {
    expect(msg).toContain('the person we can reach');
  });

  it('puts the risk on the patient, by name, not on the reader', () => {
    expect(msg).toContain('the risk falls on Test Patient One');
  });
});

describe('a case with no category on it', () => {
  const msg = buildConsumableDepositMessage({ ...base, category: null });

  it('still sends them to the right place with the right paper', () => {
    expect(msg).toContain(CONSUMABLE_SHOP);
    expect(msg).toContain('BRING THAT RECEIPT');
  });

  it('does not name a category it does not have', () => {
    expect(msg).not.toContain('*MAJOR*');
  });
});

describe('a case with no date yet', () => {
  it('says "before the day of surgery" rather than leaving a gap', () => {
    const msg = buildConsumableDepositMessage({ ...base, scheduledAt: null });
    expect(msg).toContain('before the day of surgery');
    expect(msg).not.toContain('on .');
  });
});

describe('the short version', () => {
  it('keeps the four things and drops the argument', () => {
    const s = buildShortDepositMessage(base);
    expect(s).toContain('consumable shop at the Emergency');
    expect(s).toContain('a MAJOR procedure');
    expect(s).toContain('Keep the receipt');
    expect(s).toContain('bring it to the theatre on the day');
    // The long explanation is the part a caller gives in their own words.
    expect(s).not.toContain('sterile wrapping');
  });

  it('is short enough to survive one screen', () => {
    expect(buildShortDepositMessage(base).length).toBeLessThan(500);
  });

  it('switches person for a caregiver here too', () => {
    const s = buildShortDepositMessage({ ...base, owner: 'CAREGIVER' });
    expect(s).toContain('Test Patient One has');
    expect(s).not.toContain('you have');
  });

  it('keeps the one safety sentence that changes what somebody buys', () => {
    expect(buildShortDepositMessage(base)).toContain('Materials bought outside cannot be used');
  });
});
