import { describe, it, expect } from 'vitest';
import {
  isPermanentApplyFailure,
  permanentFailureReason,
  sqlStateOf,
} from '../../src/lib/sync/permanentFailure';

/**
 * The real shape, copied from the theatre server's Vercel logs on 7 September.
 * Prisma wraps a raw-query failure as P2010 and puts the driver's SQLSTATE in
 * meta, so a predicate that only reads err.code sees 'P2010' and misses it.
 */
const prismaRaw = (sqlstate: string, message: string) =>
  Object.assign(new Error(
    'Invalid `prisma.$executeRawUnsafe()` invocation: '
    + `Raw query failed. Code: \`${sqlstate}\`. Message: \`${message}\``), {
    code: 'P2010',
    clientVersion: '5.22.0',
    meta: { code: sqlstate, message },
  });

describe('finding the SQLSTATE', () => {
  it('reads it out of Prisma meta, not the P2010 wrapper', () => {
    expect(sqlStateOf(prismaRaw('23505', 'Key ("surgeryId")=(x) already exists.'))).toBe('23505');
  });

  it('reads it off a plain node-postgres error', () => {
    expect(sqlStateOf(Object.assign(new Error('dup'), { code: '23505' }))).toBe('23505');
  });

  it('falls back to the message when there is no structured field', () => {
    expect(sqlStateOf(new Error('Raw query failed. Code: `23514`. Message: `bad`'))).toBe('23514');
  });

  it('is null when there is no code at all', () => {
    expect(sqlStateOf(new Error('connection reset'))).toBeNull();
    expect(sqlStateOf(null)).toBeNull();
    expect(sqlStateOf('a string')).toBeNull();
  });

  it('does not mistake a Prisma code for a SQLSTATE', () => {
    // P2024 is Prisma's pool timeout — five characters, but not a SQLSTATE.
    // It must not be read as one, because it is emphatically transient.
    expect(isPermanentApplyFailure(Object.assign(new Error('pool'), { code: 'P2024' }))).toBe(false);
  });
});

describe('what is permanent, and what only looks it', () => {
  it('treats a unique violation as permanent', () => {
    // The 33 entries that blocked 861 others for five days.
    expect(isPermanentApplyFailure(
      prismaRaw('23505', 'Key ("surgeryId")=(69898be0) already exists.'))).toBe(true);
  });

  it('treats a check violation as permanent', () => {
    expect(isPermanentApplyFailure(prismaRaw('23514', 'violates check constraint'))).toBe(true);
  });

  it('does NOT treat a foreign key violation as permanent', () => {
    // The common transient case in a sync: the parent row is in a later batch
    // or in the other direction's pull, and the child applies once it lands.
    // Quarantining these would discard ordinary traffic on a timing accident.
    expect(isPermanentApplyFailure(
      prismaRaw('23503', 'violates foreign key constraint'))).toBe(false);
  });

  it('does NOT treat a deadlock or serialisation failure as permanent', () => {
    expect(isPermanentApplyFailure(prismaRaw('40P01', 'deadlock detected'))).toBe(false);
    expect(isPermanentApplyFailure(prismaRaw('40001', 'could not serialize'))).toBe(false);
  });

  it('does NOT treat a connection failure as permanent', () => {
    expect(isPermanentApplyFailure(new Error('Timed out fetching a new connection'))).toBe(false);
    expect(isPermanentApplyFailure(new Error('ECONNRESET'))).toBe(false);
  });

  it('gives up on nothing it cannot identify', () => {
    // The safe default: retry. Only a recognised permanent code settles an
    // entry without writing it.
    expect(isPermanentApplyFailure(undefined)).toBe(false);
    expect(isPermanentApplyFailure({})).toBe(false);
  });
});

describe('the reason recorded against a quarantined entry', () => {
  it('keeps the constraint detail and drops the stack', () => {
    const reason = permanentFailureReason(
      prismaRaw('23505', 'Key ("surgeryId")=(69898be0) already exists.'));
    expect(reason).toContain('23505');
    expect(reason).toContain('surgeryId');
    expect(reason).not.toContain('$executeRawUnsafe');
  });

  it('stays short enough to store and read', () => {
    const reason = permanentFailureReason(prismaRaw('23505', 'x'.repeat(5000)));
    expect(reason.length).toBeLessThan(300);
  });

  it('says something useful even for an unrecognised error', () => {
    expect(permanentFailureReason(new Error('something odd'))).toContain('something odd');
  });
});
