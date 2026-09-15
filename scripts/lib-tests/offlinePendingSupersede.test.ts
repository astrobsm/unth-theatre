/**
 * The duplicated patient, and the booking that could not be made.
 *
 * WHAT HAPPENED, on 15 September 2026. Two patients — NWAKAMA BRIDGET EZIAKU
 * (folder 496076) and OHAIKE STELLA (folder 9877) — were registered, and each
 * then appeared TWICE in the patients list. The database held exactly one row
 * for each; the second was this device's own optimistic copy of a registration
 * that had been queued and had since synced perfectly well.
 *
 * Neither patient could be booked. The duplicate carried its local
 * `offline-…` id, so selecting it in the booking dropdown sent the server an id
 * it had never seen, and the answer was "Patient not found" for a patient
 * plainly on the screen. Both bookings were lost.
 *
 * THE CAUSE was one line. The merge asked whether the server list already
 * contained a row whose id equalled the pending record's CLIENT id — and the
 * server never returns that id. It returns the row under a real uuid, because
 * that is what it assigned. So the check could never fire for a create that had
 * actually landed, and the optimistic copy was prepended to the list forever.
 *
 * The queue does clear these after a successful replay. What it cannot clear is
 * a first attempt that timed out on the device while succeeding on the server,
 * or a queue drained by the service worker. Those are exactly the permanent
 * cases, so the fix works from what the server returns rather than from
 * bookkeeping that has already been missed once.
 */
import { describe, expect, it } from 'vitest';

import {
  mergePendingIntoList,
  naturalKeyOf,
  supersededCreates,
  supersededInPayload,
  PENDING_FLAG,
  type PendingRecord,
} from '../../src/lib/offlineMerge';

const pendingCreate = (body: Record<string, unknown>, clientId = 'offline-abc'): PendingRecord => ({
  clientId,
  entityType: 'patients',
  op: 'create',
  url: '/api/patients',
  method: 'POST',
  body,
  createdAt: Date.now(),
  idempotencyKey: clientId.replace('offline-', ''),
});

const BRIDGET = {
  name: 'NWAKAMA BRIDGET EZIAKU',
  folderNumber: '496076',
  ptNumber: 'PT496076',
  age: 29,
  gender: 'Female',
};

describe('the patient who appeared twice', () => {
  it('drops the local copy once the real record is in the list', () => {
    const server = [{ id: 'c1124473-b3fb-4cb1-ba8d-2d54963904da', ...BRIDGET }];
    const merged = mergePendingIntoList(server, [pendingCreate(BRIDGET)], 'patients') as Record<string, unknown>[];

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('c1124473-b3fb-4cb1-ba8d-2d54963904da');
    // And critically, the row that survives is the real one — the surgeon must
    // not be left holding an id the server has never seen.
    expect(String(merged[0].id).startsWith('offline-')).toBe(false);
  });

  it('still shows the local copy while the real record is genuinely absent', () => {
    // The whole reason pending records exist. A registration made with no
    // network must appear immediately, or the nurse's work has vanished.
    const merged = mergePendingIntoList([], [pendingCreate(BRIDGET)], 'patients') as Record<string, unknown>[];
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('offline-abc');
    expect(merged[0][PENDING_FLAG]).toBe('create');
  });

  it('matches despite the folder number being written differently', () => {
    // "PT-529930" and "PT529930" are one folder number typed by two people, and
    // the patients table already holds both spellings.
    const server = [{ id: 'real', name: 'OKAFOR INNOCENT', folderNumber: 'PT-529930', age: 40 }];
    const pending = pendingCreate({ name: 'OKAFOR INNOCENT', folderNumber: 'pt 529930', age: 40 });
    const merged = mergePendingIntoList(server, [pending], 'patients') as Record<string, unknown>[];
    expect(merged).toHaveLength(1);
  });

  it('falls back to the PT number when no folder number was issued', () => {
    const server = [{ id: 'real', name: 'OHAIKE STELLA', ptNumber: 'PT9877', age: 55 }];
    const pending = pendingCreate({ name: 'OHAIKE STELLA', ptNumber: 'PT9877', age: 55 });
    expect(mergePendingIntoList(server, [pending], 'patients')).toHaveLength(1);
  });
});

describe('what must NOT be merged away', () => {
  it('keeps two different patients apart', () => {
    const server = [{ id: 'real', name: 'Okeke Bridget', folderNumber: '914763', age: 92 }];
    const pending = pendingCreate({ name: 'Chukwuemezie Bridget', folderNumber: '914679', age: 68 });
    const merged = mergePendingIntoList(server, [pending], 'patients') as Record<string, unknown>[];
    expect(merged).toHaveLength(2);
  });

  it('keeps two people with the same name but different ages apart', () => {
    // Both of these are real rows in this hospital's patients table.
    const server = [{ id: 'real', name: 'Okeke Bridget', age: 92 }];
    const pending = pendingCreate({ name: 'Okeke Bridget', age: 31 });
    expect(mergePendingIntoList(server, [pending], 'patients')).toHaveLength(2);
  });

  it('supersedes nothing for an entity with no natural key', () => {
    // An unknown shape leaves the pending row on screen. A visible duplicate is
    // irritating; a silently dropped record is a lost clinical entry.
    const server = [{ id: 'real', something: 'x' }];
    const pending: PendingRecord = { ...pendingCreate({ something: 'x' }), entityType: 'widgets' };
    expect(mergePendingIntoList(server, [pending], 'widgets')).toHaveLength(2);
  });

  it('supersedes nothing when the pending record carries no body', () => {
    const server = [{ id: 'real', ...BRIDGET }];
    const pending: PendingRecord = { ...pendingCreate(BRIDGET), body: null };
    expect(mergePendingIntoList(server, [pending], 'patients')).toHaveLength(2);
  });

  it('leaves updates and deletes alone', () => {
    // Supersession is about creates only. An edit queued offline still has to
    // be applied over the server row when it arrives.
    const server = [{ id: 'real', ...BRIDGET, ward: 'WARD 9' }];
    const update: PendingRecord = {
      clientId: 'offline-update-real-k', entityType: 'patients', op: 'update',
      targetId: 'real', url: '/api/patients/real', method: 'PATCH',
      body: { ward: 'WARD 2' }, createdAt: Date.now(),
    };
    const merged = mergePendingIntoList(server, [update], 'patients') as Record<string, unknown>[];
    expect(merged).toHaveLength(1);
    expect(merged[0].ward).toBe('WARD 2');
    expect(merged[0][PENDING_FLAG]).toBe('update');
  });
});

describe('surgeries', () => {
  const booking = {
    patientId: 'c1124473-b3fb-4cb1-ba8d-2d54963904da',
    scheduledDate: '2026-09-16T00:00:00.000Z',
    procedureName: 'Excision of skin tumour and reconstruction',
  };

  it('drops the local copy once the booking is on the server list', () => {
    const server = [{ id: 'real-surgery', ...booking }];
    const pending: PendingRecord = { ...pendingCreate(booking, 'offline-s1'), entityType: 'surgeries' };
    expect(mergePendingIntoList(server, [pending], 'surgeries')).toHaveLength(1);
  });

  it('matches a date sent as a plain day against one stored with a time', () => {
    const server = [{ id: 'real-surgery', ...booking }];
    const pending: PendingRecord = {
      ...pendingCreate({ ...booking, scheduledDate: '2026-09-16' }, 'offline-s1'),
      entityType: 'surgeries',
    };
    expect(mergePendingIntoList(server, [pending], 'surgeries')).toHaveLength(1);
  });

  it('keeps a second, genuinely different operation on the same patient and day', () => {
    // A patient returning to theatre twice in a day is a real case this
    // application supports on purpose. Collapsing the two would delete a booking.
    const server = [{ id: 'real-surgery', ...booking }];
    const pending: PendingRecord = {
      ...pendingCreate({ ...booking, procedureName: 'Split thickness skin graft' }, 'offline-s2'),
      entityType: 'surgeries',
    };
    expect(mergePendingIntoList(server, [pending], 'surgeries')).toHaveLength(2);
  });

  it('keeps the same procedure booked for a different patient', () => {
    const server = [{ id: 'real-surgery', ...booking }];
    const pending: PendingRecord = {
      ...pendingCreate({ ...booking, patientId: 'someone-else' }, 'offline-s3'),
      entityType: 'surgeries',
    };
    expect(mergePendingIntoList(server, [pending], 'surgeries')).toHaveLength(2);
  });
});

describe('the natural key itself', () => {
  it('prefers the folder number over everything else', () => {
    expect(naturalKeyOf('patients', { folderNumber: '496076', ptNumber: 'PT9', name: 'X', age: 2 }))
      .toBe('patients:496076');
  });

  it('normalises punctuation and case', () => {
    expect(naturalKeyOf('patients', { folderNumber: 'pt-49 60.76' }))
      .toBe(naturalKeyOf('patients', { folderNumber: 'PT496076' }));
  });

  it('answers null when there is nothing to key on', () => {
    expect(naturalKeyOf('patients', {})).toBeNull();
    expect(naturalKeyOf('patients', { name: 'Someone' })).toBeNull(); // no age
    expect(naturalKeyOf('surgeries', { patientId: 'p' })).toBeNull(); // no date or procedure
    expect(naturalKeyOf('anything-else', { id: 'x' })).toBeNull();
  });

  it('does not treat an empty string as an identifier', () => {
    // Otherwise every row with a blank folder number keys the same and they all
    // collapse into one, which would delete patients from the screen.
    expect(naturalKeyOf('patients', { folderNumber: '   ', ptNumber: '', name: 'A', age: 1 }))
      .toBe('patients:A:1');
  });
});

describe('reporting which records to forget', () => {
  it('names the clientIds whose records have landed', () => {
    const rows = [{ id: 'real', ...BRIDGET }];
    const gone = supersededCreates(rows, [pendingCreate(BRIDGET, 'offline-xyz')], 'patients');
    expect(gone.has('offline-xyz')).toBe(true);
  });

  it('names nothing when the list is empty', () => {
    expect(supersededCreates([], [pendingCreate(BRIDGET)], 'patients').size).toBe(0);
  });

  it('finds the list inside a wrapped payload', () => {
    const payload = { data: [{ id: 'real', ...BRIDGET }] };
    const gone = supersededInPayload(payload, [pendingCreate(BRIDGET, 'offline-w')], 'patients');
    expect(gone.has('offline-w')).toBe(true);
  });

  it('finds the list under the entity name', () => {
    const payload = { patients: [{ id: 'real', ...BRIDGET }], total: 1 };
    const gone = supersededInPayload(payload, [pendingCreate(BRIDGET, 'offline-e')], 'patients');
    expect(gone.has('offline-e')).toBe(true);
  });

  it('answers empty for a payload with no list it understands', () => {
    expect(supersededInPayload({ ok: true }, [pendingCreate(BRIDGET)], 'patients').size).toBe(0);
    expect(supersededInPayload(null, [pendingCreate(BRIDGET)], 'patients').size).toBe(0);
  });
});
