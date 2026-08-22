/**
 * The audit trail's two pure parts: who the caller was, and what changed.
 *
 * writeAudit itself is a database call and is exercised through the routes;
 * what is worth testing here is the logic that decides what gets recorded.
 */
import { describe, expect, it } from 'vitest';

import { clientIp, diffFields } from '../../src/lib/imprest/audit';

/** Minimal stand-in for NextRequest — only `headers.get` is used. */
const req = (headers: Record<string, string>) =>
  ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as never;

describe('who the caller was', () => {
  it('takes the client from x-forwarded-for, not the proxy', () => {
    // The client is first; the rest are hops it passed through.
    expect(clientIp(req({ 'x-forwarded-for': '102.89.4.7, 10.0.0.1, 10.0.0.2' }))).toBe('102.89.4.7');
  });

  it('handles a single address', () => {
    expect(clientIp(req({ 'x-forwarded-for': '102.89.4.7' }))).toBe('102.89.4.7');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(req({ 'x-real-ip': '41.58.2.9' }))).toBe('41.58.2.9');
  });

  it('returns undefined rather than an empty string when nothing is known', () => {
    expect(clientIp(req({}))).toBeUndefined();
    expect(clientIp(req({ 'x-forwarded-for': '  ' }))).toBeUndefined();
  });
});

describe('what changed', () => {
  it('records only the fields that moved', () => {
    const changes = diffFields(
      { amountReceived: 100, status: 'DRAFT', purpose: 'Theatre consumables' },
      { amountReceived: 250, status: 'ACTIVE', purpose: 'Theatre consumables' },
      ['amountReceived', 'status', 'purpose']
    ) as Record<string, { from: unknown; to: unknown }>;

    expect(Object.keys(changes).sort().join(',')).toBe('amountReceived,status');
    expect(changes.amountReceived.from).toBe(100);
    expect(changes.amountReceived.to).toBe(250);
  });

  it('returns null when nothing moved, so no empty entry is written', () => {
    expect(diffFields({ a: 1 }, { a: 1 }, ['a'])).toBeNull();
  });

  it('carries BigInt kobo across as a string — JSON cannot hold a BigInt', () => {
    const changes = diffFields(
      { balance: BigInt(50_000_000) },
      { balance: BigInt(11_250_000) },
      ['balance']
    ) as Record<string, { from: unknown; to: unknown }>;
    expect(changes.balance.from).toBe('50000000');
    expect(changes.balance.to).toBe('11250000');
  });

  it('treats two equal dates as equal, not as different objects', () => {
    const a = new Date('2026-07-31T00:00:00Z');
    const b = new Date('2026-07-31T00:00:00Z');
    expect(diffFields({ d: a }, { d: b }, ['d'])).toBeNull();
  });

  it('sees a real date change', () => {
    const changes = diffFields(
      { d: new Date('2026-07-31T00:00:00Z') },
      { d: new Date('2026-08-01T00:00:00Z') },
      ['d']
    ) as Record<string, { from: unknown; to: unknown }>;
    expect(changes.d.to).toContain('2026-08-01');
  });

  it('treats null and undefined alike — a field that was never set has not changed', () => {
    expect(diffFields({ x: null }, {}, ['x'])).toBeNull();
  });

  it('ignores fields it was not asked about', () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 1, b: 99 }, ['a'])).toBeNull();
  });
});
