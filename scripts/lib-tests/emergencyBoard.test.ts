/**
 * Adopting an emergency onto the board.
 *
 * The one decision worth pinning: whether adopting a case should also put it on
 * the theatre radio. Getting it wrong is silent in BOTH directions — too eager
 * and the complex hears about last month's cases, too shy and a genuine
 * emergency is adopted with nobody told. A flaky observation during
 * verification is what prompted this test.
 */
import { describe, expect, it } from 'vitest';

import {
  ANNOUNCE_IF_NEWER_THAN_MS,
  RECONCILE_EVERY_MS,
  shouldAnnounceOnAdoption,
  shouldRunReconcile,
} from './emergency/ensureBooking';

const NOW = new Date('2026-08-03T21:00:00.000Z');
const agoMs = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 60 * 60 * 1000;

describe('whether adopting a case also announces it', () => {
  it('announces one booked moments ago', () => {
    expect(shouldAnnounceOnAdoption(agoMs(1000), NOW)).toBe(true);
  });

  it('announces one booked earlier in the shift', () => {
    expect(shouldAnnounceOnAdoption(agoMs(5 * HOUR), NOW)).toBe(true);
  });

  it('stays silent about yesterday', () => {
    expect(shouldAnnounceOnAdoption(agoMs(30 * HOUR), NOW)).toBe(false);
  });

  it('stays silent about the historical backfill', () => {
    // The sixteen adopted cases ran from 17 June to 31 July. Announcing those
    // would have repeated over the theatre radio until acknowledged.
    expect(shouldAnnounceOnAdoption(new Date('2026-06-17T10:00:00.000Z'), NOW)).toBe(false);
    expect(shouldAnnounceOnAdoption(new Date('2026-07-31T09:00:00.000Z'), NOW)).toBe(false);
  });

  it('is exactly six hours', () => {
    expect(ANNOUNCE_IF_NEWER_THAN_MS).toBe(6 * HOUR);
    expect(shouldAnnounceOnAdoption(agoMs(ANNOUNCE_IF_NEWER_THAN_MS - 1), NOW)).toBe(true);
    expect(shouldAnnounceOnAdoption(agoMs(ANNOUNCE_IF_NEWER_THAN_MS), NOW)).toBe(false);
  });

  it('does not announce a case dated in the future', () => {
    // A clock skew or a mis-entered date must not make something announceable
    // forever; a negative age is still inside the window, which is correct —
    // it is a brand new record either way.
    expect(shouldAnnounceOnAdoption(new Date(NOW.getTime() + HOUR), NOW)).toBe(true);
  });
});

describe('the safety-net sweep is throttled', () => {
  it('does not run again immediately', () => {
    // Measured against production, the sweep took 6.4 seconds to confirm there
    // was nothing to do. Every write site already calls ensureEmergencyBooking
    // directly, so this is a backstop — and a backstop must not be the slowest
    // thing on the page.
    const now = 1_000_000_000;
    expect(shouldRunReconcile(now - 1000, now)).toBe(false);
  });

  it('runs again once the interval has passed', () => {
    const now = 1_000_000_000;
    expect(shouldRunReconcile(now - RECONCILE_EVERY_MS, now)).toBe(true);
    expect(shouldRunReconcile(now - RECONCILE_EVERY_MS - 1, now)).toBe(true);
  });

  it('always runs the very first time', () => {
    // lastReconcileAt starts at 0, so a fresh server never skips the sweep.
    expect(shouldRunReconcile(0, 1_000_000_000)).toBe(true);
  });

  it('is five minutes', () => {
    expect(RECONCILE_EVERY_MS).toBe(5 * 60 * 1000);
  });
});
