import { describe, it, expect } from 'vitest';
import { classifyFailure, toWhatsAppNumber, mapDeliveryStatus } from '../../src/lib/comms/whatsapp';

// Every WhatsApp message is billable, so "should we try again" is a spending
// decision as much as a technical one. These tests pin it.

describe('classifyFailure — retry only what can succeed', () => {
  it('retries a rate limit', () => {
    expect(classifyFailure(429).retryable).toBe(true);
  });

  it('retries a provider outage', () => {
    expect(classifyFailure(500).retryable).toBe(true);
    expect(classifyFailure(503).retryable).toBe(true);
  });

  it('does NOT retry bad credentials', () => {
    // A retry cannot fix a token, and hammering an unauthorised endpoint is how
    // an account gets restricted.
    expect(classifyFailure(401).retryable).toBe(false);
    expect(classifyFailure(403).retryable).toBe(false);
  });

  it('does NOT retry a number that is not on WhatsApp', () => {
    // It will not be on WhatsApp the second time either.
    const r = classifyFailure(400, 131026);
    expect(r.retryable).toBe(false);
    expect(r.reason).toMatch(/not on WhatsApp/);
  });

  it('does NOT retry outside the 24-hour window', () => {
    const r = classifyFailure(400, 131047);
    expect(r.retryable).toBe(false);
    expect(r.reason).toMatch(/24-hour window/);
  });

  it('does NOT retry an unapproved template', () => {
    // It stays unapproved however many times it is sent.
    expect(classifyFailure(400, 132000).retryable).toBe(false);
    expect(classifyFailure(400, 132001).retryable).toBe(false);
  });

  it('does not retry a plain rejection', () => {
    expect(classifyFailure(400).retryable).toBe(false);
  });

  it('gives every failure a reason a person can act on', () => {
    for (const [status, code] of [[429], [500], [401], [400, 131026], [400, 132000]] as const) {
      const r = classifyFailure(status as number, code as number | undefined);
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('toWhatsAppNumber', () => {
  it('converts a local number', () => {
    expect(toWhatsAppNumber('08012345678')).toBe('2348012345678');
  });

  it('handles the spacing and punctuation staff type', () => {
    expect(toWhatsAppNumber('0801 234 5678')).toBe('2348012345678');
    expect(toWhatsAppNumber('+234-801-234-5678')).toBe('2348012345678');
  });

  it('accepts an already-international number', () => {
    expect(toWhatsAppNumber('2348012345678')).toBe('2348012345678');
  });

  it('leaves a plausible foreign number alone', () => {
    // Relatives abroad do pay for care.
    expect(toWhatsAppNumber('+44 7700 900123')).toBe('447700900123');
  });

  it('returns null for junk rather than guessing', () => {
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('abc')).toBeNull();
    expect(toWhatsAppNumber('12345')).toBeNull();
  });
});

describe('mapDeliveryStatus', () => {
  it('maps the states Meta reports', () => {
    expect(mapDeliveryStatus('sent')).toBe('SENT');
    expect(mapDeliveryStatus('delivered')).toBe('DELIVERED');
    expect(mapDeliveryStatus('read')).toBe('READ');
    expect(mapDeliveryStatus('failed')).toBe('FAILED');
  });

  it('ignores anything it does not recognise', () => {
    // A new state from Meta must not be silently treated as something else.
    expect(mapDeliveryStatus('deleted')).toBeNull();
    expect(mapDeliveryStatus('')).toBeNull();
  });
});
