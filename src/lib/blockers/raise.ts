// ============================================================
// Raising the same dialog for a block that never reaches the server
// ------------------------------------------------------------
// Most refusals come back from an API and the fetch interceptor announces them
// on their own. Some never get that far: a time outside theatre hours, a form
// that knows it is incomplete, a step that needs an earlier step done first.
// Those are the ones people get most stuck on, because the screen simply
// refuses and says little.
//
// This gives any form one line to raise the SAME dialog, so a block caught on
// the device looks and behaves exactly like one caught on the server. A person
// should not have to learn two different ways of being told no.
// ============================================================

import type { Blocker, Fix, FieldProblem } from './catalogue';

export const RAISE_EVENT = 'orm:blocked-raise';

export interface RaiseInput {
  /** Four or five words. */
  title: string;
  /** One sentence: why, without blame and without jargon. */
  why: string;
  /** The specific things that are wrong, where the form knows them. */
  fields?: FieldProblem[];
  /**
   * What can be done about it. A fix must DO something — go to the screen
   * where it is solved, or put the cursor in the field. If there is genuinely
   * nothing to offer, leave it empty and a plain close button is added, but
   * consider whether the dialog is worth showing at all in that case.
   */
  fixes?: Fix[];
  /** 'warn' where the user can proceed anyway. Defaults to 'block'. */
  severity?: 'block' | 'warn';
  /** For the audit trail and for telling two similar blocks apart. */
  code?: string;
}

/**
 * Show the block dialog for something the form worked out for itself.
 *
 * Safe to call from anywhere on the client, including during render-adjacent
 * event handlers; on the server it does nothing rather than throwing.
 */
export function raiseBlock(input: RaiseInput): void {
  if (typeof window === 'undefined') return;

  const blocker: Blocker = {
    code: input.code ?? 'CLIENT_BLOCK',
    title: input.title,
    why: input.why,
    fields: input.fields ?? [],
    fixes: input.fixes?.length
      ? input.fixes
      : [{ kind: 'close', label: 'Close and correct it' }],
    severity: input.severity ?? 'block',
  };

  window.dispatchEvent(new CustomEvent(RAISE_EVENT, { detail: blocker }));
}
