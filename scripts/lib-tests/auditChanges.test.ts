import { describe, it, expect } from 'vitest';
import { auditChanges, auditChangesJson } from '../../src/lib/auditChanges';

// The measurement that prompted this: audit_logs.changes held 43 MB across
// 6,051 rows, averaging 24 kB and peaking at 8.1 MB, because a booking's audit
// record stored the base64 consent scan that was already being stored on the
// surgery. Both tables replicate, so both copies crossed the uplink.
//
// The danger in fixing it is the opposite error — stripping so eagerly that the
// audit trail stops answering "who changed what". These hold that line.

const big = 'A'.repeat(200_000); // ~150 kB decoded

describe('what must be removed', () => {
  it('replaces a consent file with a description of it', () => {
    const out = auditChanges({ consentFile: { name: 'consent.pdf', base64: big } }) as any;
    expect(out.consentFile).toMatch(/^\[file omitted: consent\.pdf/);
    expect(out.consentFile).not.toContain('AAAA');
  });

  it('reports roughly how big the omitted file was', () => {
    // "A scan was attached, about 150 kB" is the auditable fact. The bytes are not.
    const out = auditChanges({ consentFileData: big }) as any;
    expect(out.consentFileData).toMatch(/~\d+ kB/);
  });

  it('strips every known blob field, not just the one that caused the trouble', () => {
    const out = auditChanges({
      consentFile: big, consentFileData: big, consentFormData: big,
      base64: big, fileData: big, signatureData: big, photoData: big, attachment: big,
    }) as Record<string, string>;
    for (const [k, v] of Object.entries(out)) {
      expect(v, k).toContain('[file omitted');
    }
  });

  it('truncates an unreasonably long string that is not a known blob field', () => {
    // A field nobody has thought of yet must not be able to put 8 MB in a row.
    const out = auditChanges({ someNewScanField: big }) as any;
    expect(out.someNewScanField).toContain('[truncated');
    expect(out.someNewScanField.length).toBeLessThan(400);
  });
});

describe('what must survive', () => {
  it('keeps every ordinary value exactly as it was', () => {
    const body = {
      patientId: 'p1', procedureName: 'Herniorrhaphy', scheduledTime: '09:00',
      estimatedDuration: 90, needBloodTransfusion: true, magnitude: 'MAJOR',
      recentHb: 11.4, surgeonName: 'Val Ugwu', otherSpecialNeeds: null,
    };
    expect(auditChanges(body)).toEqual(body);
  });

  it('keeps clinical free text, which is long but not a payload', () => {
    // Post-op notes and indications run to hundreds of characters and are
    // exactly the thing an audit is for.
    const notes = 'Indication: '.padEnd(3_500, 'x');
    const out = auditChanges({ indication: notes }) as any;
    expect(out.indication).toBe(notes);
  });

  it('preserves structure and field names through nesting', () => {
    const out = auditChanges({
      consumableRequests: [{ name: 'Urine bag', quantity: 2, templateId: 't1' }],
    }) as any;
    expect(out.consumableRequests[0]).toEqual({ name: 'Urine bag', quantity: 2, templateId: 't1' });
  });

  it('keeps a normal-length array intact', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ name: `item ${i}` }));
    expect((auditChanges({ items }) as any).items).toHaveLength(60);
  });

  it('summarises an enormous array rather than dropping it', () => {
    // "300 pack lines" is the auditable fact; the 300 lines are not.
    const items = Array.from({ length: 300 }, (_, i) => ({ name: `item ${i}` }));
    const out = (auditChanges({ items }) as any).items;
    expect(out).toHaveLength(21);
    expect(out[20]).toBe('… 280 more items omitted');
  });

  it('leaves null and undefined alone rather than inventing values', () => {
    const out = auditChanges({ a: null, b: undefined }) as any;
    expect(out.a).toBeNull();
    expect(out.b).toBeUndefined();
  });
});

describe('it can never be the thing that fails the request', () => {
  it('does not hang or throw on a cyclic body', () => {
    const a: any = { name: 'x' };
    a.self = a;
    expect(() => auditChangesJson(a)).not.toThrow();
  });

  it('returns a note rather than throwing when serialisation is impossible', () => {
    const nasty = { get boom() { throw new Error('no'); } };
    expect(auditChangesJson(nasty)).toContain('could not be serialised');
  });

  it('produces valid JSON for a realistic booking body', () => {
    const parsed = JSON.parse(auditChangesJson({
      patientId: 'p1',
      procedureName: 'Exploratory laparotomy',
      consentFile: { name: 'signed.pdf', base64: big },
      consumableRequests: [{ name: 'Gauze', quantity: 10 }],
    }));
    expect(parsed.patientId).toBe('p1');
    expect(parsed.consentFile).toContain('[file omitted');
    expect(parsed.consumableRequests[0].quantity).toBe(10);
  });

  it('shrinks a booking record by the order of magnitude that motivated this', () => {
    const before = JSON.stringify({ consentFile: { name: 'c.pdf', base64: big }, patientId: 'p1' });
    const after = auditChangesJson({ consentFile: { name: 'c.pdf', base64: big }, patientId: 'p1' });
    expect(after.length).toBeLessThan(before.length / 100);
  });
});
