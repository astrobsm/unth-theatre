// ============================================================
// Reading and writing a structured operation note
// ------------------------------------------------------------
// Shared by the four routes that touch notes, so that "what a note includes",
// "who may see a draft" and "what happens when one is signed" have one
// definition each rather than four that drift.
// ============================================================

import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { matchTemplate, resolveTemplate, templateByKey } from './templates';
import { parseNotePayload, noteToValues } from './payload';
import { validateNote, canSign, type ChildRows } from './validate';

/** Everything a note is made of, in one read. */
export const NOTE_INCLUDE = {
  prepSteps: { orderBy: { sequence: 'asc' } },
  drains: { orderBy: { createdAt: 'asc' } },
  specimens: { orderBy: { createdAt: 'asc' } },
  heldMedications: { orderBy: { createdAt: 'asc' } },
} as const;

/**
 * Roles that may write an operation note.
 *
 * The same list the free-text endpoint has always used, with the house officer
 * added — in this hospital the house officer frequently writes the note and the
 * consultant signs it, and a rule that pretends otherwise gets worked around by
 * sharing a login, which is worse than the thing it was guarding.
 */
export const NOTE_AUTHOR_ROLES = [
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'ADMIN', 'THEATRE_MANAGER',
];

/** Roles that may sign. Signing is a clinical act and is narrower than writing. */
export const NOTE_SIGNER_ROLES = ['SURGEON', 'CONSULTANT_SURGEON', 'ADMIN'];

export interface Actor {
  id: string;
  role: string;
  name: string;
}

/** The template a note is written against, resolved from what it stored. */
export function templateForNote(note: { templateKey: string; procedureName: string | null }) {
  return resolveTemplate(templateByKey(note.templateKey));
}

/** The template for a surgery that has no note yet. */
export function templateForSurgery(surgery: { procedureName: string | null; subspecialty: string | null }) {
  return resolveTemplate(matchTemplate(surgery.procedureName, surgery.subspecialty));
}

/** The child rows of a note, in the shape the validator and summary expect. */
export function childrenOf(note: {
  prepSteps?: unknown[]; drains?: unknown[]; specimens?: unknown[]; heldMedications?: unknown[];
}): ChildRows {
  return {
    prepSteps: (note.prepSteps ?? []) as Record<string, unknown>[],
    drains: (note.drains ?? []) as Record<string, unknown>[],
    specimens: (note.specimens ?? []) as Record<string, unknown>[],
    heldMedications: (note.heldMedications ?? []) as Record<string, unknown>[],
  };
}

/**
 * Save a draft: the note row and all four child tables, atomically.
 *
 * CHILD ROWS ARE REPLACED, NOT MERGED. The form holds the whole list and sends
 * the whole list; trying to reconcile row by row would need stable ids for rows
 * the user is still adding and deleting, and would produce the one bug that
 * matters here — a drain the surgeon deleted staying in the record because its
 * delete was the message that got lost.
 *
 * It is one transaction for the same reason: a note whose drains saved and
 * whose prep steps did not is a note that is wrong in a way nobody can see.
 */
export async function saveDraft(noteId: string, body: unknown, template: ReturnType<typeof resolveTemplate>) {
  const parsed = parseNotePayload(body, template);
  if (parsed.errors.length) return { ok: false as const, errors: parsed.errors };

  await prisma.$transaction(async (tx) => {
    await tx.postOpNote.update({
      where: { id: noteId },
      data: {
        ...parsed.values,
        // Merged rather than replaced: a PATCH carrying only the flap section
        // must not blank the graft fields a previous save wrote.
        extras: Object.keys(parsed.extras).length
          ? await mergedExtras(tx, noteId, parsed.extras)
          : undefined,
      } as never,
    });

    await tx.postOpPrepStep.deleteMany({ where: { noteId } });
    if (parsed.children.prepSteps.length) {
      await tx.postOpPrepStep.createMany({
        data: parsed.children.prepSteps.map((r) => ({ ...r, noteId })) as never,
      });
    }

    await tx.postOpDrain.deleteMany({ where: { noteId } });
    if (parsed.children.drains.length) {
      await tx.postOpDrain.createMany({
        data: parsed.children.drains.map((r) => ({ ...r, noteId })) as never,
      });
    }

    await tx.postOpSpecimen.deleteMany({ where: { noteId } });
    if (parsed.children.specimens.length) {
      await tx.postOpSpecimen.createMany({
        data: parsed.children.specimens.map((r) => ({ ...r, noteId })) as never,
      });
    }

    await tx.postOpHeldMedication.deleteMany({ where: { noteId } });
    if (parsed.children.heldMedications.length) {
      await tx.postOpHeldMedication.createMany({
        data: parsed.children.heldMedications.map((r) => ({ ...r, noteId })) as never,
      });
    }
  });

  return { ok: true as const };
}

async function mergedExtras(
  tx: Prisma.TransactionClient,
  noteId: string,
  incoming: Record<string, unknown>,
) {
  const current = await tx.postOpNote.findUnique({ where: { id: noteId }, select: { extras: true } });
  const existing = (current?.extras ?? {}) as Record<string, unknown>;
  return { ...existing, ...incoming };
}

/** Every problem with a note as it currently stands in the database. */
export function problemsFor(note: Record<string, unknown>) {
  const template = templateForNote(note as { templateKey: string; procedureName: string | null });
  return validateNote(template, noteToValues(note), childrenOf(note as never));
}

export { canSign, noteToValues };
