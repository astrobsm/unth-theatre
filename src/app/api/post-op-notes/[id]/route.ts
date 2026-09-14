import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import {
  NOTE_AUTHOR_ROLES, NOTE_INCLUDE, saveDraft, templateForNote, problemsFor, noteToValues, childrenOf,
} from '@/lib/postop/service';
import { buildNursingSummary } from '@/lib/postop/nursingSummary';

export const dynamic = 'force-dynamic';

async function load(id: string) {
  return prisma.postOpNote.findUnique({ where: { id }, include: NOTE_INCLUDE });
}

/**
 * One note, with everything needed to render it: its rows, the problems it
 * still has, and the nursing sheet it generates.
 *
 * The summary is computed here rather than stored, so it can never disagree
 * with the note it claims to summarise.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const note = await load(params.id);
  if (!note) return NextResponse.json({ error: 'No such note.' }, { status: 404 });

  const user = session!.user as { id: string };
  if (note.status === 'DRAFT' && note.createdById !== user.id) {
    // Deliberately 404, not 403. That a colleague has an unfinished note on
    // this case is not something to announce.
    return NextResponse.json({ error: 'No such note.' }, { status: 404 });
  }

  const problems = problemsFor(note as never);
  const summary = buildNursingSummary(
    noteToValues(note as never),
    childrenOf(note as never),
    { surgeonName: note.signedByName ?? note.surgeonName, signedAt: note.signedAt },
  );

  return NextResponse.json({
    note,
    template: templateForNote(note).key,
    problems,
    summary,
  });
}

/**
 * Save a draft.
 *
 * A SIGNED NOTE IS NOT EDITED. That is the whole of the rule, and it is enforced
 * here rather than in the UI: a correction after signing is an addendum, which
 * leaves the original standing and visible. A record that can be revised after
 * the fact without trace is not evidence of anything, and this note may
 * eventually be read in a courtroom.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string };
  if (!NOTE_AUTHOR_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Only the surgical team may write an operation note.' }, { status: 403 });
  }

  const note = await load(params.id);
  if (!note) return NextResponse.json({ error: 'No such note.' }, { status: 404 });

  if (note.status === 'SIGNED') {
    return NextResponse.json(
      { error: 'This note has been signed and cannot be changed. Add an addendum instead.' },
      { status: 409 });
  }
  if (note.createdById !== user.id) {
    return NextResponse.json({ error: 'This draft belongs to somebody else.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await saveDraft(params.id, body, templateForNote(note));
  if (!result.ok) {
    return NextResponse.json({ error: result.errors[0], errors: result.errors }, { status: 400 });
  }

  const saved = await load(params.id);
  return NextResponse.json({
    note: saved,
    problems: problemsFor(saved as never),
  });
}

/**
 * Discard a draft.
 *
 * Drafts only, and only your own. A signed note is never deleted through the
 * application — it is part of the patient record, and the thing somebody wants
 * when they ask to delete one is an addendum saying what was wrong.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string };
  const note = await prisma.postOpNote.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, createdById: true },
  });
  if (!note) return NextResponse.json({ error: 'No such note.' }, { status: 404 });

  if (note.status === 'SIGNED') {
    return NextResponse.json(
      { error: 'A signed note is part of the patient record and cannot be deleted.' },
      { status: 409 });
  }
  if (note.createdById !== user.id) {
    return NextResponse.json({ error: 'This draft belongs to somebody else.' }, { status: 403 });
  }

  // The children go with it: the cascade is declared on the foreign keys.
  await prisma.postOpNote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
