import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import {
  NOTE_INCLUDE, NOTE_SIGNER_ROLES, saveDraft, templateForNote,
  problemsFor, canSign, noteToValues, childrenOf,
} from '@/lib/postop/service';
import { buildNursingSummary, summaryToText } from '@/lib/postop/nursingSummary';

export const dynamic = 'force-dynamic';

/**
 * Sign an operation note.
 *
 * Three things happen, in one transaction, and the order matters.
 *
 * 1. THE NOTE IS CHECKED AGAIN, on the server, with the same function the form
 *    ran in the browser. Not because the browser is untrusted in the ordinary
 *    sense, but because a note can be signed by a different person on a
 *    different machine from the one that wrote it, and because a blocking
 *    problem is a half-written order that a nurse cannot carry out. Client-side
 *    validation is a courtesy; this is the rule.
 *
 * 2. IT IS WRITTEN INTO THE OLD SHAPE AS WELL. An audit_logs row with
 *    action = 'POST_OP_NOTE', and the narrative appended to surgeries.remarks,
 *    exactly as the free-text endpoint has always done. That is what keeps the
 *    PACU discharge PDF, the patient-journey PDF and anything else reading
 *    those working with no change at all. The row carries the note's id so the
 *    feed can recognise it as a duplicate and show the note once.
 *
 * 3. THE SURGEON ON THE CASE IS CORRECTED if the note names somebody else. The
 *    person who operated is frequently not the person named at booking, and
 *    the note is the more reliable of the two.
 *
 * A signed note is never edited afterwards. There is no PUT here for that
 * reason, and PATCH on the note refuses once status is SIGNED.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!NOTE_SIGNER_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: 'Only a surgeon may sign an operation note.' },
      { status: 403 });
  }

  const existing = await prisma.postOpNote.findUnique({
    where: { id: params.id },
    include: NOTE_INCLUDE,
  });
  if (!existing) return NextResponse.json({ error: 'No such note.' }, { status: 404 });
  if (existing.status === 'SIGNED') {
    return NextResponse.json({ error: 'This note is already signed.' }, { status: 409 });
  }

  // The form sends its current state with the signature, so signing cannot
  // capture a version older than what is on screen.
  const body = await req.json().catch(() => ({}));
  if (body && typeof body === 'object' && 'values' in body) {
    const saved = await saveDraft(params.id, body, templateForNote(existing));
    if (!saved.ok) {
      return NextResponse.json({ error: saved.errors[0], errors: saved.errors }, { status: 400 });
    }
  }

  const note = await prisma.postOpNote.findUnique({ where: { id: params.id }, include: NOTE_INCLUDE });
  if (!note) return NextResponse.json({ error: 'No such note.' }, { status: 404 });

  const problems = problemsFor(note as never);
  if (!canSign(problems)) {
    return NextResponse.json({
      error: 'This note has instructions that cannot be carried out as they stand.',
      problems: problems.filter((p) => p.severity === 'blocking'),
    }, { status: 422 });
  }

  if (!note.findings.trim()) {
    return NextResponse.json(
      { error: 'An operation note needs its findings before it can be signed.' },
      { status: 422 });
  }

  const signerName = user.fullName || user.name || 'Unknown';
  const signedAt = new Date();

  const summary = buildNursingSummary(
    noteToValues(note as never),
    childrenOf(note as never),
    { surgeonName: note.surgeonName ?? signerName, signedAt },
  );

  // The narrative, as the old free-text field held it: the findings, then the
  // plan under the heading the previous page used. Anything that parsed those
  // notes still parses this one.
  const narrative = note.reviewNotes?.trim()
    ? `${note.findings.trim()}\n\nPOST-OP PLAN:\n${note.reviewNotes.trim()}`
    : note.findings.trim();

  await prisma.$transaction(async (tx) => {
    await tx.postOpNote.update({
      where: { id: note.id },
      data: { status: 'SIGNED', signedAt, signedById: user.id, signedByName: signerName },
    });

    const surgery = await tx.surgery.findUnique({
      where: { id: note.surgeryId },
      select: { remarks: true, surgeonName: true, surgeonId: true },
    });

    const stamp = signedAt.toLocaleString('en-GB');
    const nextRemarks =
      `${surgery?.remarks || ''}\n\n[POST-OP NOTE ${stamp} - ${signerName}]\n${narrative}`.trim();

    const surgeonUpdate: { surgeonName?: string; surgeonId?: string | null } = {};
    if (note.surgeonName && note.surgeonName !== surgery?.surgeonName) {
      surgeonUpdate.surgeonName = note.surgeonName;
      surgeonUpdate.surgeonId = note.surgeonId ?? null;
    }

    // The surgical complexity score, which has always been completed at the
    // end of the note and stored on the surgery. It stays there rather than
    // moving onto the note: the score describes the OPERATION, one per case,
    // and an addendum must not be able to restate it.
    const complexityUpdate: Record<string, unknown> = {};
    if (body?.complexity && typeof body.complexity === 'object') {
      const score = Number(body.complexityScore);
      if (Number.isFinite(score)) {
        complexityUpdate.complexityScore = Math.max(0, Math.min(100, Math.round(score)));
      }
      if (typeof body.complexityClass === 'string') {
        complexityUpdate.complexityClass = body.complexityClass.slice(0, 40);
      }
      try {
        complexityUpdate.complexityData = JSON.stringify(body.complexity);
      } catch {
        // A complexity payload that will not serialise is dropped. It must
        // never take the operation note down with it.
      }
      complexityUpdate.complexityAssessedAt = signedAt;
      complexityUpdate.complexityAssessedBy = signerName;
    }

    await tx.surgery.update({
      where: { id: note.surgeryId },
      data: { remarks: nextRemarks, ...surgeonUpdate, ...complexityUpdate },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'POST_OP_NOTE',
        tableName: 'surgeries',
        recordId: note.surgeryId,
        changes: JSON.stringify({
          note: narrative,
          images: note.images,
          // How the feed knows this row and the structured note are one note.
          postOpNoteId: note.id,
          templateKey: note.templateKey,
          structured: true,
        }),
      },
    });
  });

  const signed = await prisma.postOpNote.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE });

  return NextResponse.json({
    note: signed,
    summary,
    summaryText: summaryToText(summary),
    // Advisory problems are returned rather than swallowed. The note is signed
    // and valid; these are things the surgeon chose to leave, and showing them
    // afterwards is how the next note gets written better.
    advisories: problems.filter((p) => p.severity === 'advisory'),
  });
}
