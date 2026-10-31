// ============================================================
// Medicines the patient had to buy
// ------------------------------------------------------------
//   POST { action: 'PRINTED' }               — the list went out to the patient
//   POST { action: 'VERIFIED', items: [...] } — this is what came back
//
// The second one is the step the ORM never had. Out-of-stock items were
// flagged, the patient was sent to buy them, and whatever they returned with
// went onto the trolley with nothing in the record saying a pharmacist had
// looked at it. The check was being done; it was simply never written down,
// which is indistinguishable from not being done at all the moment anybody
// asks.
//
// WHO IT NOTIFIES IS THE POINT OF RECORDING IT. An accepted purchase tells the
// anaesthetist the case is complete; a rejected one tells them, before the
// morning, that a drug they are expecting is still not in the building.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { triggerRadio } from '@/lib/radioEvents';
import {
  outOfStockNames,
  summariseVerification,
  rejectReason,
  describeVerification,
  type PurchaseCheck,
} from '@/lib/pharmacy/purchaseVerification';

export const dynamic = 'force-dynamic';

const PHARMACY_ROLES = [
  'PHARMACIST',
  'HEAD_OF_PHARMACY',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
];

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('PRINTED') }),
  z.object({
    action: z.literal('VERIFIED'),
    items: z.array(
      z.object({
        drugName: z.string().min(1),
        outcome: z.enum(['ACCEPTED', 'REJECTED']),
        brand: z.string().optional().nullable(),
        expiry: z.string().optional().nullable(),
        quantity: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      }),
    ).min(1),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? '';
  if (!PHARMACY_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'Only pharmacy can record what a patient bought' },
      { status: 403 },
    );
  }

  const userId = (session.user as { id?: string }).id ?? null;
  const userName =
    (session.user as { fullName?: string | null; name?: string | null }).fullName
    || (session.user as { name?: string | null }).name
    || 'Pharmacy';

  try {
    const body = schema.parse(await request.json());

    const rx = await prisma.anestheticPrescription.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        patientName: true,
        outOfStockItems: true,
        hasOutOfStockItems: true,
        prescribedById: true,
        approvedById: true,
        surgery: { select: { id: true, procedureName: true, surgeonId: true } },
      },
    });
    if (!rx) return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });

    const expected = outOfStockNames(rx.outOfStockItems);
    if (expected.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nothing on this prescription is marked out of stock, so there is nothing for the '
            + 'patient to buy. Mark the items out of stock first.',
        },
        { status: 400 },
      );
    }

    if (body.action === 'PRINTED') {
      await prisma.anestheticPrescription.update({
        where: { id: rx.id },
        data: { purchaseListPrintedAt: new Date(), purchaseListPrintedById: userId },
      });
      return NextResponse.json({ printed: true, items: expected });
    }

    // ── What the patient brought back ─────────────────────────────────
    const checks: PurchaseCheck[] = body.items.map((i) => ({
      drugName: i.drugName.trim(),
      outcome: i.outcome,
      brand: i.brand?.trim() || null,
      expiry: i.expiry?.trim() || null,
      quantity: i.quantity?.trim() || null,
      note: i.note?.trim() || null,
    }));

    const refusal = rejectReason(checks);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });

    const summary = summariseVerification(expected, checks);

    const updated = await prisma.anestheticPrescription.update({
      where: { id: rx.id },
      data: {
        purchaseVerification: JSON.stringify(checks),
        // Stamped even on a partial check, because the question the record has
        // to answer is "when did a pharmacist last look at this", and a stamp
        // withheld until everything is perfect answers it for nobody.
        purchaseVerifiedAt: new Date(),
        purchaseVerifiedById: userId,
        purchaseVerifiedByName: userName,
      },
      select: { id: true, purchaseVerifiedAt: true, purchaseVerifiedByName: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: userId ?? '',
        action: 'VERIFY_PATIENT_PURCHASE',
        tableName: 'AnestheticPrescription',
        recordId: rx.id,
        changes: JSON.stringify({ checks, summary }),
      },
    });

    // Everybody who is counting on the drug being there. A rejection in
    // particular has to travel: it is the difference between a case that can
    // start and one that cannot, and the morning is far too late to find out.
    const notify = Array.from(new Set([
      rx.prescribedById,
      rx.approvedById,
      rx.surgery?.surgeonId,
    ].filter(Boolean) as string[]));

    if (notify.length) {
      const headline = summary.complete
        ? `Medicines ${rx.patientName} bought have been checked and accepted`
        : summary.rejected.length > 0
          ? `Medicines ${rx.patientName} bought were NOT accepted`
          : `Medicines ${rx.patientName} bought — partly checked`;
      const detail = summary.rejected.length > 0
        ? `Sent back: ${summary.rejected.join(', ')}.`
        : summary.outstanding.length > 0
          ? `Still to check: ${summary.outstanding.join(', ')}.`
          : 'All items match the prescription.';
      await prisma.notification.createMany({
        data: notify.map((uid) => ({
          userId: uid,
          type: 'PATIENT_PURCHASE_VERIFIED',
          title: headline,
          message:
            `${userName} checked the medicines bought for ${rx.patientName}`
            + `${rx.surgery?.procedureName ? ` (${rx.surgery.procedureName})` : ''}. `
            + `${describeVerification(summary)}. ${detail}`,
          link: '/dashboard/prescriptions',
        })),
      });
    }

    await triggerRadio({
      category: summary.rejected.length > 0 ? 'WORKFLOW' : 'CONFIRMATION',
      title: summary.rejected.length > 0
        ? 'Patient-bought medicines rejected'
        : 'Patient-bought medicines verified',
      message:
        `${userName} checked the medicines bought for ${rx.patientName}: `
        + `${describeVerification(summary)}.`
        + (summary.rejected.length > 0 ? ` Sent back: ${summary.rejected.join(', ')}.` : ''),
      priority: summary.rejected.length > 0 ? 70 : 50,
      triggeredById: userId ?? undefined,
      metadata: { prescriptionId: rx.id, summary },
    });

    return NextResponse.json({ verified: true, summary, prescription: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: e.errors }, { status: 400 });
    }
    console.error('[prescriptions/purchase] failed:', e);
    return NextResponse.json({ error: 'Could not record it' }, { status: 500 });
  }
}
