// ============================================================
// Issuing a patient their information sheet
// ------------------------------------------------------------
//   POST — mint a personal link, record what was issued, and (for WhatsApp)
//          queue the approved template that carries the link.
//
// WHAT IS RECORDED AND WHY. The row is the proof that written information was
// given: which edition, by whom, when, and later whether the patient opened
// it. "The risks were explained" is an assertion; this is a record, and it
// answers honestly in both directions.
//
// WHAT GOES OUT ON WHATSAPP. The approved template, with three variables:
// the patient's name, the hospital, and the link. Not the operation, not the
// diagnosis, not the date. checkSendAllowed refuses CLINICAL content on an
// external channel and that rule is correct — see lib/counselling/issue.ts.
//
// THE SHEET IS SNAPSHOTTED onto the row rather than read live from the
// surgery, so that amending the case later cannot silently change the
// document a patient has already read.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { HOSPITAL_NAME } from '@/lib/patients/notices';
import { procedureSlug } from '@/lib/procedures/normalise';
import { COUNSELLING_VERSION } from '@/lib/counselling/universal';
import { resolveEntry } from '@/lib/counselling/leaflet';
import {
  COUNSELLING_TEMPLATE_CODE, blockersForIssue, counsellingExpiry,
  counsellingTemplateVariables, counsellingUrl, isIssueChannel, newCounsellingToken,
} from '@/lib/counselling/issue';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json().catch(() => null);
    const surgeryId = typeof body?.surgeryId === 'string' ? body.surgeryId.trim() : '';
    const channel = isIssueChannel(body?.channel) ? body.channel : 'WHATSAPP';
    if (!surgeryId) {
      return NextResponse.json({ error: 'Which case is this for?' }, { status: 400 });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true, procedureName: true, indication: true, unit: true, subspecialty: true,
        surgeonName: true, scheduledDate: true,
        patient: {
          select: {
            id: true, name: true, folderNumber: true, ptNumber: true,
            phoneNumber: true, caregiverPhone: true, whatsappOptOut: true,
          },
        },
      },
    });
    if (!surgery) {
      return NextResponse.json({ error: 'That case is not here.' }, { status: 404 });
    }

    const patient = surgery.patient;
    // The patient's own number first. A caregiver's number is a fallback and
    // is NOT used silently — if it is all there is, the sender is told, so
    // that handing a relative somebody's medical information is a decision
    // somebody made rather than one the system made for them.
    const phone = (patient?.phoneNumber ?? '').trim();

    const blockers = blockersForIssue({
      patientName: patient?.name,
      phone,
      procedureName: surgery.procedureName,
      channel,
      whatsappOptOut: patient?.whatsappOptOut,
    });
    if (blockers.length) {
      return NextResponse.json(
        { error: blockers[0].say, blockers },
        { status: 400 },
      );
    }

    // Which counselling this sheet will carry, decided and recorded now.
    const slug = procedureSlug(surgery.procedureName ?? '');
    const catalogue = await prisma.surgicalProcedure
      .findFirst({
        where: { slug, subspecialty: surgery.subspecialty ?? undefined },
        select: { category: true },
      })
      .catch(() => null);

    const { matchedOn } = resolveEntry({
      procedureName: surgery.procedureName ?? '',
      procedureSlug: slug,
      category: catalogue?.category ?? null,
      subspecialty: surgery.subspecialty,
    });

    const { token, tokenHash } = newCounsellingToken();
    const user = session!.user as { id?: string; name?: string | null };

    const issue = await prisma.patientCounsellingIssue.create({
      data: {
        patientId: patient?.id ?? null,
        surgeryId: surgery.id,
        tokenHash,
        expiresAt: counsellingExpiry(),
        procedureName: surgery.procedureName ?? 'Operation',
        procedureSlug: slug || null,
        category: catalogue?.category ?? null,
        subspecialty: surgery.subspecialty ?? null,
        indication: surgery.indication ?? null,
        unit: surgery.unit ?? null,
        surgeonName: surgery.surgeonName ?? null,
        scheduledFor: surgery.scheduledDate ?? null,
        leafletVersion: COUNSELLING_VERSION,
        matchedOn,
        channel,
        issuedById: user.id ?? null,
        issuedByName: user.name ?? null,
      },
      select: { id: true },
    });

    const link = counsellingUrl(token);

    if (channel === 'WHATSAPP') {
      const queued = await queueMessage({
        channel: 'WHATSAPP' as never,
        priority: 'NORMAL' as never,
        recipientName: patient?.name ?? null,
        recipientAddress: toWhatsAppNumber(phone),
        // The patient is not an outside party to their own name.
        recipientIsPatient: true,
        templateCode: COUNSELLING_TEMPLATE_CODE,
        variables: counsellingTemplateVariables({
          patientName: patient?.name ?? '',
          hospital: HOSPITAL_NAME,
          link,
        }),
        relatedType: 'SURGERY',
        relatedId: surgery.id,
        trigger: 'PATIENT_OPERATION_INFORMATION',
        // Keyed on the ISSUE, not the case: a second sheet is deliberately a
        // second message, because the first link may have gone to a wrong
        // number and reissuing is the remedy.
        scope: `counselling:${issue.id}`,
        createdById: user.id ?? null,
        createdByName: user.name ?? null,
      });

      if (!queued.queued && !queued.duplicate) {
        // The link exists and the record stands; only the sending failed. Say
        // so, and hand back the link so it can be given another way.
        return NextResponse.json(
          {
            ok: true,
            sent: false,
            issueId: issue.id,
            link,
            warning: queued.reason
              ?? 'The sheet was prepared but the message could not be queued. Copy the link or print it instead.',
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({ ok: true, sent: channel === 'WHATSAPP', issueId: issue.id, link });
  } catch (err) {
    console.error('[counselling] issue failed:', err);
    return NextResponse.json({ error: 'The information sheet could not be issued.' }, { status: 500 });
  }
}
