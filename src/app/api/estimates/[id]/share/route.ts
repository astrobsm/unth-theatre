import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { buildShareMessage, whatsAppShareUrl, toWhatsAppNumber } from '@/lib/estimates/share';

export const dynamic = 'force-dynamic';

/**
 * POST /api/estimates/[id]/share   { phone }
 *
 * Records that an estimate was given to a patient, and returns the WhatsApp
 * link for the client to open.
 *
 * The recording is the point. "What were they told, and when?" must have one
 * answer, and a share button that opens WhatsApp without leaving a trace cannot
 * answer it. The message text is composed on the SERVER for the same reason —
 * so what was sent is derived from the stored estimate rather than from whatever
 * the page happened to be displaying.
 */

const SHARE_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CONSULTANT_SURGEON', 'SURGEON', 'ACCOUNTANT', 'BILLING_OFFICER', 'NURSE',
];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!SHARE_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Not permitted to share estimates.' }, { status: 403 });
  }

  let body: { phone?: string; viewUrl?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const phone = (body.phone ?? '').trim();
  if (!phone) return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 });
  if (!toWhatsAppNumber(phone)) {
    return NextResponse.json(
      { error: 'That does not look like a usable phone number.' }, { status: 400 });
  }

  const estimate = await prisma.surgeryEstimate.findUnique({
    where: { id: params.id },
    select: {
      id: true, estimateNumber: true, status: true, patientName: true,
      procedureName: true, totalKobo: true, depositKobo: true,
      plannedDate: true, validUntil: true,
    },
  });
  if (!estimate) return NextResponse.json({ error: 'Estimate not found.' }, { status: 404 });

  // A DRAFT is uncosted or unchecked. Sending one to a patient is the specific
  // mistake this module exists to prevent, so it is refused here as well as
  // watermarked on the document — a wrong figure in a family's hands cannot be
  // recalled.
  if (estimate.status === 'DRAFT' || estimate.status === 'PENDING_REVIEW') {
    return NextResponse.json({
      error: 'This estimate has not been approved yet. Approve it before sending it to a patient.',
    }, { status: 409 });
  }
  if (estimate.status === 'CANCELLED' || estimate.status === 'SUPERSEDED' || estimate.status === 'EXPIRED') {
    return NextResponse.json({
      error: `This estimate is ${estimate.status.toLowerCase()} and must not be sent.`,
    }, { status: 409 });
  }
  if (estimate.totalKobo <= 0) {
    return NextResponse.json({
      error: 'This estimate has no charges on it.',
    }, { status: 409 });
  }

  const message = buildShareMessage({
    estimateNumber: estimate.estimateNumber,
    patientName: estimate.patientName,
    procedureName: estimate.procedureName,
    totalKobo: estimate.totalKobo,
    depositKobo: estimate.depositKobo,
    plannedDate: estimate.plannedDate,
    validUntil: estimate.validUntil,
    viewUrl: body.viewUrl ?? null,
  });

  const url = whatsAppShareUrl(phone, message);
  if (!url) {
    return NextResponse.json({ error: 'Could not build a WhatsApp link for that number.' }, { status: 400 });
  }

  // Recorded BEFORE the link is handed back. If the person never taps send we
  // have over-recorded, which is recoverable; if we recorded afterwards we would
  // have no record of estimates that were actually sent, which is not.
  await prisma.$transaction(async (tx) => {
    await tx.surgeryEstimate.update({
      where: { id: estimate.id },
      data: {
        status: 'ISSUED',
        issuedAt: new Date(),
        sharedToPhone: phone,
        sharedAt: new Date(),
      },
    });
    if (user.id) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'ESTIMATE_SHARED',
          tableName: 'surgery_estimates',
          recordId: estimate.id,
          changes: JSON.stringify({
            estimateNumber: estimate.estimateNumber,
            phone,
            totalKobo: estimate.totalKobo,
            channel: 'WHATSAPP',
          }),
        },
      });
    }
  });

  return NextResponse.json({ url, message });
}
