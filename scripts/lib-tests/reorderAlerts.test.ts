/**
 * Stock reorder alerts: the two places a wrong answer destroys the feature.
 *
 * An alert is only worth having while people believe it. A single false "out
 * of stock" about an item somebody can see on the shelf teaches the whole
 * theatre that these messages are wrong, and after that the true one is
 * ignored too. So the classification is proved at every boundary rather than
 * around them.
 *
 * The other half is the sentence. Meta approves a fixed template body with
 * positional variables, so the entire variable part arrives as one finished
 * phrase built here. It has to read as English at every combination —
 * including the ones that look unlikely until a hospital produces them, like
 * exactly one item out and nothing else wrong.
 *
 * The arithmetic itself is NOT tested here, deliberately. onHand and available
 * belong to lib/stock/quantities.ts and summariseAvailability() excludes
 * expired and disposed batches before counting. A second set of expectations
 * about what "available" means is exactly how the message and the screen come
 * to disagree.
 */
import { describe, expect, it } from 'vitest';

import {
  classify, summarise, needsAttention, APPROACHING_MULTIPLIER, EXPIRING_WITHIN_DAYS,
  STOCK_ALERT_ROLES, ALERTING_LEVELS,
  type ItemPosition, type StockLevel,
} from '../../src/lib/inventory/reorderAlerts';

const at = (level: StockLevel, expiringSoon = 0): ItemPosition => ({
  itemId: 'x', name: 'Item', category: 'CONSUMABLE',
  available: 0, reorderLevel: 10, level, expiringSoon,
});

describe('classifying one item against its reorder level', () => {
  it('calls nothing an alert when no reorder level is set', () => {
    // Inventing a threshold produces alerts nobody configured and cannot act
    // on, and the first response to an alert you did not ask for is to ignore
    // the next one.
    expect(classify(0, null)).toBe('OK');
    expect(classify(0, undefined)).toBe('OK');
    expect(classify(0, 0)).toBe('OK');
    expect(classify(5, -1)).toBe('OK');
  });

  it('is OUT only at zero or below', () => {
    expect(classify(0, 10)).toBe('OUT');
    expect(classify(-3, 10)).toBe('OUT');   // a negative count is still nothing on the shelf
    expect(classify(1, 10)).not.toBe('OUT');
  });

  it('is CRITICAL at exactly the reorder level, not one below it', () => {
    // The off-by-one that matters. "Reorder level 10" means reorder AT ten,
    // not after it has gone past.
    expect(classify(10, 10)).toBe('CRITICAL');
    expect(classify(9, 10)).toBe('CRITICAL');
    expect(classify(11, 10)).not.toBe('CRITICAL');
  });

  it('is APPROACHING up to half as much again, and OK beyond', () => {
    // reorderLevel 10 → approaching covers 11..15, OK from 16.
    expect(classify(11, 10)).toBe('APPROACHING');
    expect(classify(15, 10)).toBe('APPROACHING');
    expect(classify(16, 10)).toBe('OK');
  });

  it('rounds the approaching boundary up, so an odd level still warns', () => {
    // reorderLevel 5 × 1.5 = 7.5. Rounding down would leave 8 unwarned when
    // the intent is clearly to warn there.
    expect(APPROACHING_MULTIPLIER).toBe(1.5);
    expect(classify(8, 5)).toBe('APPROACHING');
    expect(classify(9, 5)).toBe('OK');
  });

  it('never skips a level as stock falls', () => {
    // The property behind the boundaries: walking the quantity down must pass
    // OK → APPROACHING → CRITICAL → OUT in order, with no gaps and no
    // oscillation.
    const order: StockLevel[] = ['OK', 'APPROACHING', 'CRITICAL', 'OUT'];
    let last = 0;
    for (let q = 40; q >= 0; q -= 1) {
      const idx = order.indexOf(classify(q, 10));
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
    expect(last).toBe(order.indexOf('OUT'));
  });
});

describe('what counts as needing attention', () => {
  it('includes every alerting level', () => {
    for (const lvl of ALERTING_LEVELS) expect(needsAttention(at(lvl))).toBe(true);
  });

  it('excludes a healthy item', () => {
    expect(needsAttention(at('OK'))).toBe(false);
  });

  it('includes a healthy item that is about to expire', () => {
    // Plenty on the shelf and all of it going out of date is a supply problem
    // that a reorder level cannot see.
    expect(needsAttention(at('OK', 12))).toBe(true);
  });
});

describe('the sentence the recipient actually reads', () => {
  it('reads as English for a single item', () => {
    expect(summarise([at('OUT')])).toBe('1 item is out of stock');
  });

  it('pluralises correctly', () => {
    expect(summarise([at('OUT'), at('OUT')])).toBe('2 items are out of stock');
  });

  it('joins several findings with a final "and"', () => {
    const s = summarise([at('OUT'), at('CRITICAL'), at('CRITICAL'), at('APPROACHING')]);
    expect(s).toBe('1 item is out of stock, 2 at or below the reorder level and 1 approaching it');
  });

  it('never mentions a category with nothing in it', () => {
    // "0 items are out of stock" is the phrasing that gets a message skimmed
    // and then ignored.
    const s = summarise([at('APPROACHING')]);
    expect(s).not.toMatch(/\b0\b/);
    expect(s).toBe('1 approaching it');
  });

  it('names expiring stock separately from low stock', () => {
    const s = summarise([at('OK', 3)]);
    expect(s).toBe(`1 with stock expiring within ${EXPIRING_WITHIN_DAYS} days`);
  });

  it('says something even when handed nothing', () => {
    // Should never be sent in this state, but a sentence that reads as a
    // template failure would be worse than a dull one.
    expect(summarise([])).toBe('nothing needs attention');
  });
});

describe('who is told', () => {
  it('reaches everyone who can act on it', () => {
    for (const r of ['THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST',
      'CONSUMABLE_PACK_PROVIDER']) {
      expect(STOCK_ALERT_ROLES).toContain(r);
    }
  });

  it('does not message clinicians who cannot raise an order', () => {
    // A surgeon cannot order gloves. Telling them weekly teaches them that ORM
    // messages are not for them, and the surgical digest is.
    for (const r of ['CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'SCRUB_NURSE', 'ANAESTHETIST']) {
      expect(STOCK_ALERT_ROLES).not.toContain(r);
    }
  });
});
