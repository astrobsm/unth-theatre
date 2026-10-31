import { describe, it, expect } from 'vitest';
import {
  outOfStockNames,
  parseChecks,
  summariseVerification,
  rejectReason,
  describeVerification,
  type PurchaseCheck,
} from '../../src/lib/pharmacy/purchaseVerification';

// This decides whether a drug a patient bought in a shop is treated as checked
// before it reaches an anaesthetic trolley. A false "verified" is the dangerous
// direction: it puts a green tick on a case where nobody confirmed the drug,
// the strength or the expiry.

const CHECK = (over: Partial<PurchaseCheck> = {}): PurchaseCheck => ({
  drugName: 'Propofol 1%',
  outcome: 'ACCEPTED',
  ...over,
});

describe('reading what the patient was asked to buy', () => {
  it('reads a plain array of names', () => {
    expect(outOfStockNames('["Propofol 1%","Atracurium"]'))
      .toEqual(['Propofol 1%', 'Atracurium']);
  });

  // The column has held two shapes over its life. A reader that understood
  // only the newer one would quietly report "nothing to buy" on the older
  // rows, which is the worst possible way to be wrong here.
  it('reads the older array-of-objects shape too', () => {
    expect(outOfStockNames('[{"drugName":"Propofol 1%"},{"drugName":"Atracurium"}]'))
      .toEqual(['Propofol 1%', 'Atracurium']);
  });

  it('returns nothing rather than throwing on a malformed column', () => {
    expect(outOfStockNames('not json')).toEqual([]);
    expect(outOfStockNames('{"a":1}')).toEqual([]);
    expect(outOfStockNames(null)).toEqual([]);
    expect(outOfStockNames('')).toEqual([]);
  });

  it('drops blanks and duplicates', () => {
    expect(outOfStockNames('["Propofol","","Propofol","  "]')).toEqual(['Propofol']);
  });
});

describe('reading back a check that was already recorded', () => {
  it('keeps the fields a pharmacist filled in', () => {
    const parsed = parseChecks(JSON.stringify([{
      drugName: 'Propofol 1%', outcome: 'REJECTED', brand: 'Generic',
      expiry: '03/2027', quantity: '2 vials', note: 'Wrong strength',
    }]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].outcome).toBe('REJECTED');
    expect(parsed[0].note).toBe('Wrong strength');
  });

  // An unreadable outcome must not become an acceptance by accident... but it
  // also must not become a rejection, which would report a patient as having
  // brought the wrong thing. ACCEPTED is the stored default and the row is
  // only ever written by this app, so an unknown value means a corrupted
  // record, not a rejection to invent.
  it('ignores rows with no drug name', () => {
    expect(parseChecks('[{"outcome":"ACCEPTED"}]')).toEqual([]);
  });

  it('survives a malformed column', () => {
    expect(parseChecks('garbage')).toEqual([]);
    expect(parseChecks(null)).toEqual([]);
  });
});

describe('where a prescription stands on the medicines the patient bought', () => {
  const expected = ['Propofol 1%', 'Atracurium'];

  it('is not complete while anything is unchecked', () => {
    const s = summariseVerification(expected, [CHECK()]);
    expect(s.accepted).toEqual(['Propofol 1%']);
    expect(s.outstanding).toEqual(['Atracurium']);
    expect(s.complete).toBe(false);
  });

  // The dangerous one. A patient sent back to the shop has not completed
  // anything, and a green tick here would tell the anaesthetist the case is
  // ready when a drug is still missing from the building.
  it('is not complete when an item was sent back', () => {
    const s = summariseVerification(expected, [
      CHECK(),
      CHECK({ drugName: 'Atracurium', outcome: 'REJECTED', note: 'Expired' }),
    ]);
    expect(s.rejected).toEqual(['Atracurium']);
    expect(s.complete).toBe(false);
  });

  it('is complete only when every item was checked and accepted', () => {
    const s = summariseVerification(expected, [
      CHECK(),
      CHECK({ drugName: 'Atracurium' }),
    ]);
    expect(s.complete).toBe(true);
  });

  it('matches names regardless of case and surrounding space', () => {
    const s = summariseVerification(['Propofol 1%'], [CHECK({ drugName: '  propofol 1%  ' })]);
    expect(s.accepted).toEqual(['Propofol 1%']);
    expect(s.complete).toBe(true);
  });

  it('is never complete when nothing was expected', () => {
    expect(summariseVerification([], []).complete).toBe(false);
  });

  it('ignores a check for something the patient was never asked to buy', () => {
    const s = summariseVerification(['Propofol 1%'], [
      CHECK(),
      CHECK({ drugName: 'Something else entirely' }),
    ]);
    expect(s.accepted).toEqual(['Propofol 1%']);
    expect(s.complete).toBe(true);
  });
});

describe('what the record has to contain before it is accepted', () => {
  // "They brought the wrong thing" is the line a later query, a refund or an
  // argument about a delayed case turns on. A rejection with an empty note
  // answers none of those questions.
  it('refuses a rejection with no reason', () => {
    const why = rejectReason([CHECK({ outcome: 'REJECTED' })]);
    expect(why).toContain('Propofol 1%');
  });

  it('refuses a rejection whose reason is only whitespace', () => {
    expect(rejectReason([CHECK({ outcome: 'REJECTED', note: '   ' })])).not.toBeNull();
  });

  it('accepts a rejection that says what was wrong', () => {
    expect(rejectReason([CHECK({ outcome: 'REJECTED', note: 'Expired 2024' })])).toBeNull();
  });

  it('does not demand a note for an acceptance', () => {
    expect(rejectReason([CHECK()])).toBeNull();
  });

  it('refuses an empty submission', () => {
    expect(rejectReason([])).toBe('Nothing was checked.');
  });
});

describe('describing it in one line', () => {
  it('counts each outcome', () => {
    const s = summariseVerification(['A', 'B', 'C'], [
      { drugName: 'A', outcome: 'ACCEPTED' },
      { drugName: 'B', outcome: 'REJECTED', note: 'Wrong' },
    ]);
    expect(describeVerification(s)).toBe('1 accepted, 1 sent back, 1 still to check');
  });

  it('says so when there is nothing to check', () => {
    expect(describeVerification(summariseVerification([], []))).toBe('nothing to check');
  });
});
