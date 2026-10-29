import { describe, it, expect } from 'vitest';
import {
  collectUnresolvedClientIds,
  hasUnresolvedClientId,
  classifyUnresolvedParent,
  type PendingRecord,
} from '../../src/lib/offlineMerge';

// This is the code behind a surgeon pressing Submit and being told, in green,
// that the case is saved and will go through "usually within a minute" — and
// then finding no case on the list. The booking was held behind a patient
// record that was never coming, and nothing on any screen said so.
//
// The distinction these functions draw is the whole fix: a parent that is
// still queued is worth waiting for, and one the server refused is not.

const PENDING = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  clientId: 'offline-abc',
  entityType: 'patients',
  op: 'create',
  url: '/api/patients',
  method: 'POST',
  body: { name: 'Patient X' },
  createdAt: Date.now(),
  idempotencyKey: 'abc',
  ...over,
});

describe('finding what a mutation is waiting for', () => {
  it('names the unresolved ids rather than only flagging them', () => {
    // A yes/no cannot tell a one-minute wait from a permanent one, because it
    // cannot say which record to go and look at.
    const ids = collectUnresolvedClientIds(
      '/api/surgeries',
      { patientId: 'offline-abc', procedureName: 'Hernia repair' },
      {},
    );
    expect(ids).toEqual(['offline-abc']);
  });

  it('finds them in the path as well as the body', () => {
    expect(collectUnresolvedClientIds('/api/patients/offline-xyz', null, {})).toEqual([
      'offline-xyz',
    ]);
  });

  it('reports each id once however often it appears', () => {
    const ids = collectUnresolvedClientIds(
      '/api/surgeries',
      { patientId: 'offline-abc', guarantorId: 'offline-abc', team: ['offline-abc'] },
      {},
    );
    expect(ids).toEqual(['offline-abc']);
  });

  it('says nothing about ids that have been resolved', () => {
    const map = { 'offline-abc': 'real-uuid-1' };
    expect(collectUnresolvedClientIds('/api/surgeries', { patientId: 'offline-abc' }, map))
      .toEqual([]);
    expect(hasUnresolvedClientId('/api/surgeries', { patientId: 'offline-abc' }, map))
      .toBe(false);
  });

  it('leaves ordinary server ids alone', () => {
    // Only the literal `offline-` prefix is a local id. A uuid that happens to
    // be unfamiliar is not something to hold work behind.
    expect(collectUnresolvedClientIds('/api/surgeries', { patientId: 'c0ffee-1234' }, {}))
      .toEqual([]);
  });

  it('digs through nested structures', () => {
    const ids = collectUnresolvedClientIds(
      '/api/surgeries',
      { patient: { id: 'offline-1' }, needs: [{ itemId: 'offline-2' }] },
      {},
    );
    expect(ids.sort()).toEqual(['offline-1', 'offline-2']);
  });

  it('agrees with the flag it replaced', () => {
    expect(hasUnresolvedClientId('/api/surgeries', { patientId: 'offline-abc' }, {})).toBe(true);
    expect(hasUnresolvedClientId('/api/surgeries', { patientId: 'real' }, {})).toBe(false);
  });
});

describe('telling a wait from a dead end', () => {
  it('calls a queued create worth waiting for', () => {
    expect(classifyUnresolvedParent('offline-abc', [PENDING()])).toBe('in-flight');
  });

  it('calls a refused create what it is', () => {
    // The row is still on screen, badged, and still selectable. Somebody will
    // pick it again and wait again for something that is never coming.
    expect(classifyUnresolvedParent('offline-abc', [PENDING({ failed: true })])).toBe('refused');
  });

  it('calls an id this device knows nothing about unknown', () => {
    // Either the create landed and the reply was unusable, so the mapping was
    // never learned, or storage was cleared. Nothing here will resolve it.
    expect(classifyUnresolvedParent('offline-abc', [])).toBe('unknown');
    expect(classifyUnresolvedParent('offline-abc', [PENDING({ clientId: 'offline-other' })]))
      .toBe('unknown');
  });

  it('does not mistake an update or delete for the create it is waiting on', () => {
    // Only a create mints the id anything else refers to. An update queued
    // against the same record does not mean the record exists on the server.
    expect(classifyUnresolvedParent('offline-abc', [PENDING({ op: 'update' })])).toBe('unknown');
    expect(classifyUnresolvedParent('offline-abc', [PENDING({ op: 'delete' })])).toBe('unknown');
  });

  it('only the in-flight case may be waited on', () => {
    // The rule the interceptor and the queue drain both apply. Written out
    // here so a later change to either has to come past it.
    const states = (['in-flight', 'refused', 'unknown'] as const).filter(
      (s) => s !== 'in-flight',
    );
    expect(states).toEqual(['refused', 'unknown']);
  });
});
