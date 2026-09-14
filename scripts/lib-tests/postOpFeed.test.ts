/**
 * Two ways of storing a note, one list to read them from.
 *
 * Every operation note written before the structured form is an audit_logs row
 * with action = 'POST_OP_NOTE' and a JSON blob holding one free-text field.
 * There are years of them and they are NOT migrated — a migration would have to
 * invent a wound class out of a paragraph, and inventing clinical data to fill a
 * column is worse than leaving it empty, besides being irreversible.
 *
 * So the risk this file covers is the one that follows from that decision: an
 * old note becoming unreadable, or a new one appearing twice because signing
 * writes both shapes.
 */
import { describe, expect, it } from 'vitest';

import {
  legacyToEntry, structuredToEntry, mergeFeed, latestSigned, visibleTo,
  type LegacyNoteRow, type StructuredNoteRow,
} from '../../src/lib/postop/noteFeed';

const legacy = (over: Partial<LegacyNoteRow> = {}): LegacyNoteRow => ({
  id: 'a1',
  createdAt: new Date('2026-09-10T10:00:00Z'),
  changes: JSON.stringify({ note: 'Appendicectomy performed.', images: [] }),
  user: { fullName: 'Dr Eze' },
  ...over,
});

const structured = (over: Partial<StructuredNoteRow> = {}): StructuredNoteRow => ({
  id: 'b1',
  createdAt: new Date('2026-09-12T10:00:00Z'),
  createdByName: 'Dr Okeke',
  findings: 'Gallbladder inflamed, removed.',
  reviewNotes: 'Review tomorrow morning.',
  images: [],
  status: 'SIGNED',
  noteType: 'OPERATION_NOTE',
  templateKey: 'ABDOMINAL',
  signedByName: 'Dr Okeke',
  signedAt: new Date('2026-09-12T11:00:00Z'),
  ...over,
});

describe('reading an old note', () => {
  it('pulls the narrative out of the JSON blob', () => {
    const e = legacyToEntry(legacy());
    expect(e.kind).toBe('LEGACY');
    expect(e.narrative).toBe('Appendicectomy performed.');
    expect(e.authorName).toBe('Dr Eze');
  });

  it('separates the plan the old page joined on with a heading', () => {
    // The previous page saved "note\n\nPOST-OP PLAN:\nplan" into one field.
    // Left alone, an old note shows a shouty heading in mid-paragraph.
    const e = legacyToEntry(legacy({
      changes: JSON.stringify({ note: 'Findings here.\n\nPOST-OP PLAN:\nKeep nil by mouth.' }),
    }));
    expect(e.narrative).toBe('Findings here.');
    expect(e.plan).toBe('Keep nil by mouth.');
  });

  it('treats a row that is not JSON as the note itself', () => {
    // The column is TEXT and has been written by more than one version of this
    // application. A note nobody can read still beats a note nobody knows about.
    const e = legacyToEntry(legacy({ changes: 'Plain text written by an older build' }));
    expect(e.narrative).toBe('Plain text written by an older build');
  });

  it('survives a null changes column', () => {
    const e = legacyToEntry(legacy({ changes: null }));
    expect(e.narrative).toBe('');
    expect(e.images).toEqual([]);
  });

  it('falls back through fullName to username to Unknown', () => {
    expect(legacyToEntry(legacy({ user: { username: 'eze' } })).authorName).toBe('eze');
    expect(legacyToEntry(legacy({ user: null })).authorName).toBe('Unknown');
  });

  it('keeps the images', () => {
    const e = legacyToEntry(legacy({
      changes: JSON.stringify({ note: 'x', images: ['data:image/png;base64,AAA'] }),
    }));
    expect(e.images).toHaveLength(1);
  });
});

describe('the duplicate signing creates', () => {
  it('drops the audit row that shadows a structured note in the same result', () => {
    // Signing writes the old-shaped audit_logs row too, so the PACU discharge
    // PDF keeps working untouched. Without this the note would appear twice.
    const shadow = legacy({
      id: 'shadow',
      changes: JSON.stringify({ note: 'Gallbladder inflamed, removed.', postOpNoteId: 'b1' }),
    });
    const feed = mergeFeed([shadow], [structured()]);
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('STRUCTURED');
  });

  it('keeps that audit row when its structured note is not in the result', () => {
    // An old case whose structured note was deleted, or a caller asking for
    // legacy rows alone. The audit row is then the only copy left, and hiding
    // it would lose the note entirely.
    const shadow = legacy({
      id: 'shadow',
      changes: JSON.stringify({ note: 'The only surviving copy.', postOpNoteId: 'gone' }),
    });
    const feed = mergeFeed([shadow], []);
    expect(feed).toHaveLength(1);
    expect(feed[0].narrative).toBe('The only surviving copy.');
  });
});

describe('the merged order', () => {
  it('puts the newest first regardless of which shape it is', () => {
    const feed = mergeFeed(
      [legacy({ id: 'old', createdAt: new Date('2026-09-01T10:00:00Z') })],
      [structured({ id: 'new', createdAt: new Date('2026-09-13T10:00:00Z') })],
    );
    expect(feed.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('is stable when two notes share a timestamp', () => {
    // Otherwise two notes saved in the same millisecond swap places on every
    // refresh, which looks like the record changing under the reader.
    const at = new Date('2026-09-13T10:00:00Z');
    const a = mergeFeed([], [structured({ id: 'b' , createdAt: at }), structured({ id: 'a', createdAt: at })]);
    const b = mergeFeed([], [structured({ id: 'a', createdAt: at }), structured({ id: 'b', createdAt: at })]);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it('carries the structured note through for rendering', () => {
    const feed = mergeFeed([], [structured()]);
    expect(feed[0].note).toBeTruthy();
    expect(feed[0].templateKey).toBe('ABDOMINAL');
    expect(feed[0].plan).toBe('Review tomorrow morning.');
  });
});

describe('drafts', () => {
  it('hides a draft belonging to somebody else', () => {
    const entries = mergeFeed([], [structured({ id: 'd1', status: 'DRAFT' })]);
    const visible = visibleTo(entries, 'viewer-1', () => 'someone-else');
    expect(visible).toHaveLength(0);
  });

  it('shows you your own', () => {
    const entries = mergeFeed([], [structured({ id: 'd1', status: 'DRAFT' })]);
    const visible = visibleTo(entries, 'viewer-1', () => 'viewer-1');
    expect(visible).toHaveLength(1);
  });

  it('never hides a legacy note, which has no draft state to be in', () => {
    const entries = mergeFeed([legacy()], []);
    expect(visibleTo(entries, null, () => null)).toHaveLength(1);
  });

  it('is not what latestSigned returns', () => {
    const entries = mergeFeed([], [
      structured({ id: 'draft', status: 'DRAFT', createdAt: new Date('2026-09-14T10:00:00Z') }),
      structured({ id: 'signed', status: 'SIGNED', createdAt: new Date('2026-09-13T10:00:00Z') }),
    ]);
    expect(latestSigned(entries)?.id).toBe('signed');
  });

  it('prefers the most recent signed note, addendum included', () => {
    const entries = mergeFeed([], [
      structured({ id: 'addendum', noteType: 'ADDENDUM', createdAt: new Date('2026-09-14T10:00:00Z') }),
      structured({ id: 'original', createdAt: new Date('2026-09-13T10:00:00Z') }),
    ]);
    expect(latestSigned(entries)?.id).toBe('addendum');
  });

  it('answers null rather than throwing when there is nothing signed', () => {
    expect(latestSigned([])).toBeNull();
  });
});
