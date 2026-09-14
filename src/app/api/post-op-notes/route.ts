import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { NOTE_AUTHOR_ROLES, NOTE_INCLUDE, templateForSurgery } from '@/lib/postop/service';

export const dynamic = 'force-dynamic';

/**
 * Start a structured operation note for a case.
 *
 * Creating and editing are separate because a note has to exist before it can
 * be saved against, and because the draft has to survive the surgeon closing
 * the laptop. The alternative — holding the whole form in the browser until it
 * is finished — is how a long operation note gets lost to a flat battery, and
 * that has happened here with the free-text field often enough to be the reason
 * anybody asked for this.
 *
 * ONE OPEN DRAFT PER PERSON PER CASE. Asked twice, the second call returns the
 * draft the first one made rather than making another. Two half-written notes
 * for one operation is not a state anybody can resolve afterwards.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!NOTE_AUTHOR_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: 'Only the surgical team may write an operation note.' },
      { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const surgeryId = String(body.surgeryId ?? '');
  if (!surgeryId) return NextResponse.json({ error: 'Which case is this note for?' }, { status: 400 });

  const surgery = await prisma.surgery.findUnique({
    where: { id: surgeryId },
    select: {
      id: true, patientId: true, procedureName: true, subspecialty: true,
      surgeonId: true, surgeonName: true, indication: true,
    },
  });
  if (!surgery) return NextResponse.json({ error: 'No such case.' }, { status: 404 });

  const authorName = user.fullName || user.name || 'Unknown';

  const existing = await prisma.postOpNote.findFirst({
    where: { surgeryId, createdById: user.id, status: 'DRAFT' },
    include: NOTE_INCLUDE,
  });
  if (existing) {
    return NextResponse.json({ note: existing, resumed: true });
  }

  // An addendum when the case already has a signed note. A signed note is not
  // edited, so the second note on a case is an addition to the record rather
  // than a replacement of it, and it says so on its face.
  const signedAlready = await prisma.postOpNote.count({
    where: { surgeryId, status: 'SIGNED', noteType: 'OPERATION_NOTE' },
  });

  const template = templateForSurgery(surgery);

  const note = await prisma.postOpNote.create({
    data: {
      surgeryId,
      patientId: surgery.patientId,
      noteType: signedAlready > 0 ? 'ADDENDUM' : 'OPERATION_NOTE',
      templateKey: template.key,
      templateVersion: template.version,
      procedureName: surgery.procedureName,
      operativeDiagnosis: surgery.indication,
      // Carried from the case, and correctable on the form. The surgeon named
      // at booking is often not the one who operated.
      surgeonId: surgery.surgeonId,
      surgeonName: surgery.surgeonName,
      findings: '',
      createdById: user.id,
      createdByName: authorName,
    },
    include: NOTE_INCLUDE,
  });

  return NextResponse.json({ note, resumed: false, template: template.key }, { status: 201 });
}

/**
 * The notes for a case.
 *
 * Drafts are returned only to the person writing them. A draft is a surgeon
 * thinking, not a record, and it must not reach a ward round or a colleague
 * until it is signed.
 */
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string };
  const surgeryId = req.nextUrl.searchParams.get('surgeryId');
  if (!surgeryId) return NextResponse.json({ error: 'surgeryId is required.' }, { status: 400 });

  const notes = await prisma.postOpNote.findMany({
    where: {
      surgeryId,
      OR: [{ status: 'SIGNED' }, { status: 'DRAFT', createdById: user.id }],
    },
    include: NOTE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(notes);
}
