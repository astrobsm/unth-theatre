// ============================================================
// Assembling the revised policy from the changes the Chairman accepted
// ------------------------------------------------------------
// ONLY ACCEPTED CHANGES ARE APPLIED. Nothing the model proposed reaches this
// document unless somebody pressed Accept, and a change accepted with edits is
// applied as the Chairman wrote it, not as it was proposed.
//
// THE FAILURE THIS FILE IS BUILT AROUND: an accepted change that cannot be
// applied. A wording change names the text it replaces; if that text has since
// been edited, or the model quoted it with a stray space, a naive
// `body.replace(current, proposed)` does nothing at all -- and the Chairman,
// having pressed Accept, is handed a document that silently does not contain
// his change. He would then take it to Management believing it did.
//
// So every change is recorded in the change log with `applied: true | false`,
// an unapplied change carries the reason, and the caller is handed the count so
// the screen can refuse to pretend the document is finished. A change log that
// only lists successes is worse than no change log.
// ============================================================

export type ChangeKind = 'WORDING' | 'VALUE' | 'ADD' | 'REMOVE';

export interface SectionForProposal {
  id: string;
  number: string | null;
  title: string;
  parentId: string | null;
  order: number;
  body: string;
  isAppendix: boolean;
}

export interface AcceptedChange {
  id: string;
  sectionId: string | null;
  type: ChangeKind;
  currentText: string | null;
  /** What goes in: the Chairman's edit where there is one, else the proposal. */
  finalText: string;
  rationale: string;
  supportingResponseIds: string[];
  clinicalReviewRequired: boolean;
}

/** A value the committee settled for a [bracketed] placeholder. */
export interface SettledValue {
  decisionItemId: string;
  sectionId: string;
  placeholder: string;
  finalValue: string;
  rationale: string | null;
}

export interface ChangeLogEntry {
  changeId: string;
  sectionId: string | null;
  sectionLabel: string;
  type: ChangeKind | 'SETTLED_VALUE';
  applied: boolean;
  reason: string | null;
  before: string | null;
  after: string;
  rationale: string;
  supportingResponseIds: string[];
  clinicalReviewRequired: boolean;
}

export interface FinalProposal {
  body: string;
  changeLog: ChangeLogEntry[];
  applied: number;
  /** Accepted changes that could NOT be applied. Must be surfaced, not hidden. */
  unapplied: number;
}

const labelOf = (s: SectionForProposal | undefined, fallback: string): string => {
  if (!s) return fallback;
  return s.number ? `${s.number}. ${s.title}` : s.title;
};

/**
 * Collapse whitespace for comparison only.
 *
 * A quoted passage that differs from the document by a line break or a double
 * space is the same passage, and refusing it would send the Chairman to hunt
 * for an invisible difference. The replacement itself is still made against the
 * real text, so nothing is reformatted behind his back.
 */
const loose = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Find `needle` in `haystack`, tolerating whitespace differences.
 *
 * Returns the exact span in the ORIGINAL text, so the surrounding formatting
 * survives the replacement.
 */
function findLoose(haystack: string, needle: string): { start: number; end: number } | null {
  if (needle === '') return null;

  const direct = haystack.indexOf(needle);
  if (direct !== -1) return { start: direct, end: direct + needle.length };

  const target = loose(needle);
  if (target === '') return null;

  // Walk candidate starts and compare the loose forms. The bodies here are
  // single policy sections -- a few thousand characters -- so a scan is
  // cheaper than carrying an index around, and much easier to be sure of.
  for (let start = 0; start < haystack.length; start += 1) {
    if (loose(haystack[start]) === '' ) continue;
    let end = start;
    let seen = '';
    while (end < haystack.length && seen.length <= target.length + 40) {
      end += 1;
      seen = loose(haystack.slice(start, end));
      if (seen === target) return { start, end };
      if (!target.startsWith(seen)) break;
    }
  }
  return null;
}

/**
 * Build the revised policy.
 *
 * Sections are emitted in document order with their heading depth taken from
 * the tree, so the result re-imports cleanly if the committee runs a second
 * round on it.
 */
export function buildFinalProposal(opts: {
  policyTitle: string;
  version: string;
  sections: SectionForProposal[];
  changes: AcceptedChange[];
  settledValues: SettledValue[];
}): FinalProposal {
  const byId = new Map(opts.sections.map((s) => [s.id, s]));
  const depthOf = (section: SectionForProposal): number => {
    let depth = 1;
    let cursor: SectionForProposal | undefined = section;
    const guard = new Set<string>();
    while (cursor?.parentId && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      cursor = byId.get(cursor.parentId);
      if (cursor) depth += 1;
    }
    return Math.min(depth, 6);
  };

  const bodies = new Map(opts.sections.map((s) => [s.id, s.body]));
  const changeLog: ChangeLogEntry[] = [];

  const log = (entry: ChangeLogEntry) => changeLog.push(entry);

  // ── Settled values first ─────────────────────────────────────────────
  // Before the wording changes, because a wording change may quote a sentence
  // that still contains the placeholder, and settling it afterwards would then
  // miss the replacement the Chairman accepted.
  for (const settled of opts.settledValues) {
    const section = byId.get(settled.sectionId);
    const body = bodies.get(settled.sectionId);
    if (!section || body === undefined) continue;

    const found = body.includes(settled.placeholder);
    if (found) {
      bodies.set(settled.sectionId, body.split(settled.placeholder).join(settled.finalValue));
    }

    log({
      changeId: settled.decisionItemId,
      sectionId: settled.sectionId,
      sectionLabel: labelOf(section, settled.sectionId),
      type: 'SETTLED_VALUE',
      applied: found,
      reason: found
        ? null
        : `The placeholder ${settled.placeholder} is no longer in this section, so the `
          + 'settled value could not be substituted. Put it in by hand.',
      before: settled.placeholder,
      after: settled.finalValue,
      rationale: settled.rationale
        ?? 'Settled by the committee from the responses to this round.',
      supportingResponseIds: [],
      clinicalReviewRequired: false,
    });
  }

  // ── Then the accepted changes ────────────────────────────────────────
  for (const change of opts.changes) {
    const section = change.sectionId ? byId.get(change.sectionId) : undefined;
    const label = labelOf(section, change.sectionId ?? 'the policy as a whole');

    if (!change.sectionId || !section) {
      // An ADD with no section is a new provision. Collected at the end rather
      // than dropped: an accepted change that vanishes is the failure this
      // file exists to prevent.
      log({
        changeId: change.id,
        sectionId: null,
        sectionLabel: 'New provision',
        type: change.type,
        applied: change.type === 'ADD',
        reason: change.type === 'ADD'
          ? null
          : 'This change names no section, so there was nothing to change.',
        before: change.currentText,
        after: change.finalText,
        rationale: change.rationale,
        supportingResponseIds: change.supportingResponseIds,
        clinicalReviewRequired: change.clinicalReviewRequired,
      });
      continue;
    }

    const body = bodies.get(change.sectionId) ?? '';

    if (change.type === 'ADD') {
      bodies.set(change.sectionId, `${body.trimEnd()}\n\n${change.finalText.trim()}`);
      log({
        changeId: change.id,
        sectionId: change.sectionId,
        sectionLabel: label,
        type: 'ADD',
        applied: true,
        reason: null,
        before: null,
        after: change.finalText,
        rationale: change.rationale,
        supportingResponseIds: change.supportingResponseIds,
        clinicalReviewRequired: change.clinicalReviewRequired,
      });
      continue;
    }

    const quoted = change.currentText ?? '';
    const span = findLoose(body, quoted);

    if (!span) {
      log({
        changeId: change.id,
        sectionId: change.sectionId,
        sectionLabel: label,
        type: change.type,
        applied: false,
        reason: quoted.trim() === ''
          ? 'This change quotes no existing wording, so there was nothing to replace.'
          : 'The wording this change replaces is not in the section as it now stands. '
            + 'It may have been edited since the analysis ran. Apply it by hand.',
        before: change.currentText,
        after: change.finalText,
        rationale: change.rationale,
        supportingResponseIds: change.supportingResponseIds,
        clinicalReviewRequired: change.clinicalReviewRequired,
      });
      continue;
    }

    const replacement = change.type === 'REMOVE' ? '' : change.finalText;
    bodies.set(
      change.sectionId,
      body.slice(0, span.start) + replacement + body.slice(span.end),
    );

    log({
      changeId: change.id,
      sectionId: change.sectionId,
      sectionLabel: label,
      type: change.type,
      applied: true,
      reason: null,
      before: body.slice(span.start, span.end),
      after: replacement,
      rationale: change.rationale,
      supportingResponseIds: change.supportingResponseIds,
      clinicalReviewRequired: change.clinicalReviewRequired,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────
  // Depth first down the tree, so 3.1 follows 3 and the appendices stay after
  // section 16. A flat sort cannot express that, whatever it is given to
  // compare: order is only meaningful among siblings.
  const lines: string[] = [`# ${opts.policyTitle}`, '', `Version ${opts.version}`, ''];

  const emit = (parentId: string | null) => {
    const level = opts.sections
      .filter((s) => s.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const section of level) {
      const hashes = '#'.repeat(Math.min(depthOf(section) + 1, 6));
      const heading = section.number ? `${section.number} ${section.title}` : section.title;
      lines.push(`${hashes} ${heading}`, '');
      const body = (bodies.get(section.id) ?? '').trim();
      if (body !== '') lines.push(body, '');
      emit(section.id);
    }
  };
  emit(null);

  const newProvisions = changeLog.filter((e) => e.sectionId === null && e.applied);
  if (newProvisions.length > 0) {
    lines.push('## New provisions added by the committee', '');
    for (const entry of newProvisions) lines.push(entry.after.trim(), '');
  }

  return {
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    changeLog,
    applied: changeLog.filter((e) => e.applied).length,
    unapplied: changeLog.filter((e) => !e.applied).length,
  };
}

/** The change log as Markdown, for the document that goes to Management. */
export function renderChangeLog(changeLog: ChangeLogEntry[]): string {
  if (changeLog.length === 0) return '_No changes were accepted._';

  const lines: string[] = ['| Section | Change | Why | Support | Applied |', '| --- | --- | --- | --- | --- |'];
  for (const entry of changeLog) {
    const what = entry.type === 'SETTLED_VALUE'
      ? `Settled ${entry.before} as **${entry.after}**`
      : `${entry.type.toLowerCase()}: ${entry.after.slice(0, 120)}`;
    lines.push([
      '',
      entry.sectionLabel.replace(/\|/g, '\\|'),
      what.replace(/\|/g, '\\|').replace(/\n/g, ' '),
      entry.rationale.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200),
      `${entry.supportingResponseIds.length} response(s)`,
      entry.applied ? 'yes' : `no — ${entry.reason ?? 'see above'}`,
      '',
    ].join(' | ').trim());
  }
  return lines.join('\n');
}
