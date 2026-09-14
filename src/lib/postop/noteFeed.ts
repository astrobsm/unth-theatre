// ============================================================
// One list of notes, out of two ways of storing them
// ------------------------------------------------------------
// Post-operative notes were audit_logs rows with action = 'POST_OP_NOTE',
// carrying a JSON blob with one free-text field. Every note written before the
// structured form existed is one of those, and there are years of them.
//
// THEY ARE NOT MIGRATED. A migration would have to invent structure that was
// never recorded — guess a wound class from a paragraph, decide whether "keep
// elevated" meant the limb or the head. Inventing clinical data to fill a
// column is a far worse failure than having a column that is empty for old
// records, and it is not reversible.
//
// So both shapes stay, and this module is the ONLY place that knows there are
// two. Everything downstream — the page, the PDF, the discharge summary — reads
// one chronological feed of FeedEntry and never asks which table a note came
// out of.
//
// The old page also had a convention worth preserving: it joined the operation
// note and the plan into one string separated by "POST-OP PLAN:". That is
// unpicked here so an old note still shows its plan in the right place, rather
// than as a paragraph with a shouty heading in the middle of the findings.
// ============================================================

export type FeedKind = 'LEGACY' | 'STRUCTURED';

export interface FeedEntry {
  id: string;
  kind: FeedKind;
  /** ISO 8601. The feed is ordered by this, newest first. */
  createdAt: string;
  authorName: string;
  /** The operative narrative, whichever shape the note was stored in. */
  narrative: string;
  /** The plan, where it was recorded separately or can be recovered. */
  plan: string | null;
  images: string[];
  /**
   * Set on a legacy row that is the audit trail of a STRUCTURED note.
   *
   * Signing a structured note also writes the old-shaped audit_logs row, so the
   * PACU discharge PDF and anything else reading that table keeps working with
   * no change at all. The cost is that the same note arrives here twice, and
   * this is how the duplicate is recognised and dropped.
   */
  supersededBy?: string;
  /** Structured notes only. A legacy note has no status; it simply exists. */
  status?: 'DRAFT' | 'SIGNED';
  noteType?: 'OPERATION_NOTE' | 'ADDENDUM';
  templateKey?: string;
  signedByName?: string | null;
  signedAt?: string | null;
  /** The structured note itself, for rendering the detail and the nursing sheet. */
  note?: unknown;
}

/** The audit-log row shape this reads. Deliberately loose — it is old data. */
export interface LegacyNoteRow {
  id: string;
  createdAt: Date | string;
  changes: string | null;
  user?: { fullName?: string | null; username?: string | null } | null;
}

/** The marker the old page used to join a note and its plan into one field. */
const PLAN_MARKER = /\n{0,2}POST-OP PLAN:\s*\n?/i;

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/**
 * One legacy audit-log row as a feed entry.
 *
 * `changes` is JSON in practice, but it is a TEXT column that has been written
 * to by more than one version of this application, so a row that is not JSON is
 * treated as the note itself rather than discarded. A note nobody can read is
 * still better than a note nobody knows existed.
 */
export function legacyToEntry(row: LegacyNoteRow): FeedEntry {
  let narrative = '';
  let images: string[] = [];
  let supersededBy: string | undefined;

  try {
    const parsed = JSON.parse(row.changes || '{}');
    narrative = String(parsed?.note ?? '').trim();
    if (Array.isArray(parsed?.images)) {
      images = parsed.images.filter((s: unknown) => typeof s === 'string');
    }
    if (typeof parsed?.postOpNoteId === 'string') supersededBy = parsed.postOpNoteId;
  } catch {
    narrative = String(row.changes ?? '').trim();
  }

  let plan: string | null = null;
  const split = narrative.split(PLAN_MARKER);
  if (split.length > 1) {
    narrative = split[0].trim();
    plan = split.slice(1).join('\n').trim() || null;
  }

  return {
    id: row.id,
    kind: 'LEGACY',
    createdAt: iso(row.createdAt),
    authorName: row.user?.fullName || row.user?.username || 'Unknown',
    narrative,
    plan,
    images,
    supersededBy,
  };
}

/** The structured-note row shape this reads, as Prisma returns it. */
export interface StructuredNoteRow {
  id: string;
  createdAt: Date | string;
  createdByName: string;
  findings: string;
  reviewNotes: string | null;
  images: string[];
  status: 'DRAFT' | 'SIGNED';
  noteType: 'OPERATION_NOTE' | 'ADDENDUM';
  templateKey: string;
  signedByName: string | null;
  signedAt: Date | string | null;
  [key: string]: unknown;
}

export function structuredToEntry(note: StructuredNoteRow): FeedEntry {
  return {
    id: note.id,
    kind: 'STRUCTURED',
    createdAt: iso(note.createdAt),
    authorName: note.createdByName,
    narrative: (note.findings ?? '').trim(),
    plan: note.reviewNotes?.trim() || null,
    images: Array.isArray(note.images) ? note.images : [],
    status: note.status,
    noteType: note.noteType,
    templateKey: note.templateKey,
    signedByName: note.signedByName,
    signedAt: note.signedAt ? iso(note.signedAt) : null,
    note,
  };
}

/**
 * The two sources as one feed, newest first.
 *
 * DRAFTS ARE FILTERED BY CALLER, not here — the page shows the author their own
 * draft, the discharge summary must never show anybody's. Making that decision
 * in this function would mean one of the two callers getting it wrong, because
 * only they know who is asking.
 */
export function mergeFeed(legacy: LegacyNoteRow[], structured: StructuredNoteRow[]): FeedEntry[] {
  const structuredIds = new Set(structured.map((n) => n.id));
  const entries = [
    // A legacy row written as the audit trail of a structured note is dropped,
    // but only when that note is actually in this result. If it is not — an
    // old case whose structured note has since been deleted, or a caller that
    // asked for legacy rows alone — the audit row is the only copy left and
    // hiding it would lose the note entirely.
    ...legacy.map(legacyToEntry).filter((e) => !e.supersededBy || !structuredIds.has(e.supersededBy)),
    ...structured.map(structuredToEntry),
  ];
  // Newest first. Ties broken by id so the order is stable between requests —
  // two notes saved in the same millisecond otherwise swap places on refresh.
  return entries.sort((a, b) => {
    const d = b.createdAt.localeCompare(a.createdAt);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Entries safe to show to somebody who is not the author.
 *
 * A draft is a surgeon thinking, not a record. It must not reach a ward, a
 * discharge summary or another clinician until it is signed.
 */
export function visibleTo(entries: FeedEntry[], viewerId: string | null, authorIdOf: (e: FeedEntry) => string | null): FeedEntry[] {
  return entries.filter((e) => {
    if (e.kind === 'LEGACY') return true;
    if (e.status !== 'DRAFT') return true;
    return !!viewerId && authorIdOf(e) === viewerId;
  });
}

/**
 * The most recent SIGNED note for a case.
 *
 * What the discharge summary, the PACU sheet and the ward view all actually
 * want. An addendum is later than the note it amends, so "most recent signed"
 * is the right answer rather than "the operation note".
 */
export function latestSigned(entries: FeedEntry[]): FeedEntry | null {
  return entries.find((e) => e.kind === 'STRUCTURED' && e.status === 'SIGNED') ?? null;
}
