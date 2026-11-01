// ============================================================
// Approving the prescriptions waiting on me, in one press
// ------------------------------------------------------------
//   POST { prescriptionIds?: string[] }
//
// WHAT THIS ROUTE WILL NOT DO. It will not approve a prescription on a case
// that is not assigned to the person pressing the button, whatever ids are
// sent to it. The list is recomputed here from the database — the same query
// the card is drawn from — and anything the client asks for that is not in
// that list is refused and named in the reply. A bulk endpoint that trusted
// its input would let any anaesthetist approve the whole hospital's drugs
// with one request.
//
// Nor will it approve a case where the patient has been assessed NOT FIT.
// That is the one thing on this card that is worse than doing nothing, and a
// consultant pressing "approve all" is, by definition, not reading each line.
// Those are refused individually and reported back by name, so he goes and
// looks at them.
//
// Each approval goes through the same helper as the approvals screen, so the
// late-arrival flag, the audit row and the radio call to pharmacy all happen
// exactly as they would one at a time.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { livePrescription } from '@/lib/anaesthesia/board';
import { addDays, watToday } from '@/lib/anaesthesia/myCases';
import { approveAnaestheticPrescription } from '@/lib/anaesthesia/approvePrescription';

export const dynamic = 'force-dynamic';

const MY_CASES_ROLES = ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'];

/** One press should not sign off an unbounded number of patients. */
const MAX_PER_PRESS = 25;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string; name?: string } | undefined;

  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!MY_CASES_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Anaesthetists only.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const asked: string[] | null = Array.isArray(body?.prescriptionIds)
      ? body.prescriptionIds.map(String)
      : null;

    const raw = Number(body?.days ?? 7);
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), 30) : 7;
    const from = watToday();
    const to = addDays(from, days);

    // His cases, from the database, not from the request.
    const surgeries = await prisma.surgery.findMany({
      where: {
        anesthetistId: user.id,
        scheduledDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T23:59:59.999Z`),
        },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      select: {
        id: true,
        procedureName: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    });

    if (surgeries.length === 0) {
      return NextResponse.json({ approved: 0, results: [], message: 'You have no cases in this period.' });
    }

    const ids = surgeries.map((s) => s.id);
    const labelBySurgery = new Map(surgeries.map((s) => [
      s.id,
      `${s.patient?.name ?? 'Unnamed patient'}${s.patient?.folderNumber ? ` (${s.patient.folderNumber})` : ''}`,
    ]));

    const [prescriptions, reviews] = await Promise.all([
      prisma.anestheticPrescription.findMany({
        where: { surgeryId: { in: ids } },
        select: {
          id: true, surgeryId: true, status: true, version: true,
          prescribedByName: true, approvedByName: true, supersededById: true,
          createdAt: true,
        },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.preOperativeAnestheticReview.findMany({
        where: { surgeryId: { in: ids } },
        select: { surgeryId: true, fitnessDecision: true },
      }),
    ]);

    const unfit = new Set(
      reviews.filter((r) => r.fitnessDecision === 'NOT_FIT').map((r) => r.surgeryId),
    );

    const bySurgery = new Map<string, typeof prescriptions>();
    prescriptions.forEach((p) => {
      const arr = bySurgery.get(p.surgeryId) ?? [];
      arr.push(p);
      bySurgery.set(p.surgeryId, arr);
    });

    // The live prescription of each case, where it is actually awaiting him.
    const candidates: { id: string; surgeryId: string }[] = [];
    const blocked: { label: string; reason: string }[] = [];

    bySurgery.forEach((rows, surgeryId) => {
      const live = livePrescription(rows);
      if (!live || live.status !== 'PENDING_APPROVAL') return;
      if (unfit.has(surgeryId)) {
        blocked.push({
          label: labelBySurgery.get(surgeryId) ?? 'A case',
          reason: 'assessed NOT FIT — open the case and decide it yourself',
        });
        return;
      }
      candidates.push({ id: live.id, surgeryId });
    });

    const allowed = new Set(candidates.map((c) => c.id));
    const refused: string[] = [];
    let chosen = candidates;

    if (asked) {
      asked.forEach((id) => { if (!allowed.has(id)) refused.push(id); });
      chosen = candidates.filter((c) => asked.indexOf(c.id) !== -1);
    }

    if (chosen.length > MAX_PER_PRESS) {
      return NextResponse.json({
        error: `That is ${chosen.length} patients in one press. Approve them in `
          + `batches of ${MAX_PER_PRESS} or fewer, or work through them on the review board.`,
      }, { status: 400 });
    }

    const results: { prescriptionId: string; patient: string; approved: boolean; reason?: string }[] = [];
    let approvedCount = 0;

    // Sequentially: each approval writes an audit row and raises a radio
    // announcement, and twenty-five of those at once is a burst pharmacy
    // cannot read anyway.
    for (let i = 0; i < chosen.length; i += 1) {
      const c = chosen[i];
      const patient = labelBySurgery.get(c.surgeryId) ?? 'Unnamed patient';
      const outcome = await approveAnaestheticPrescription({
        prescriptionId: c.id,
        approved: true,
        approvalNotes: 'Approved from the consultant dashboard.',
        actor: { id: user.id, name: user.name ?? null },
      });

      if (outcome.ok) {
        approvedCount += 1;
        results.push({ prescriptionId: c.id, patient, approved: true });
      } else {
        results.push({
          prescriptionId: c.id,
          patient,
          approved: false,
          reason: outcome.reason === 'ALREADY_APPROVED'
            ? 'already approved'
            : 'no longer there',
        });
      }
    }

    const message = approvedCount === 0
      ? 'Nothing was approved.'
      : `Approved ${approvedCount} prescription${approvedCount === 1 ? '' : 's'}. Pharmacy has been told.`;

    return NextResponse.json({
      approved: approvedCount,
      results,
      blocked,
      refused,
      message,
    });
  } catch (err) {
    console.error('[anaesthesia/my-cases/approve] failed:', err);
    return NextResponse.json({ error: 'Could not approve those' }, { status: 500 });
  }
}
