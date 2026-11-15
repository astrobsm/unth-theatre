/**
 * What the ward records against a call-up: when the porter came, when the
 * patient went, and that the patient has gone.
 *
 * `id` is the PatientCallUp id — the theatre's invitation. The ward cannot
 * start this conversation; it answers one.
 *
 * WHAT THIS WRITES THAT NOTHING ELSE DOES
 *
 * `patientEnRouteAt` and the PATIENT_EN_ROUTE status are read by the patient
 * journey timeline, the PACU discharge summary and the holding-area chase, and
 * were written by no route in this application. The "en route to theatre" row
 * was blank on every patient because the only honest source for it is the
 * nurse who sent the patient, and that nurse had no account. This is that
 * route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { hasModuleAccess } from '@/lib/modules';
import {
  canActOnWardCase, canReleasePatient, isWardPostedRole,
} from '@/lib/ward/nurseInCharge';

export const dynamic = 'force-dynamic';

/**
 * Accepts an ISO timestamp, a bare "HH:mm" (bound to today), or null to clear.
 * `undefined` means the field was not sent and must be left as it is — a form
 * that posts only what changed must not blank the rest.
 */
function parseTime(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h > 23 || m > 59) return undefined;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasModuleAccess(session.user.role, session.user.extraModules, 'ward-desk')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!params.id) {
      return NextResponse.json({ error: 'Call-up id is required' }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, fullName: true, role: true, wardAssignment: true },
    });
    if (!me) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const callUp = await prisma.patientCallUp.findUnique({
      where: { id: params.id },
      select: {
        id: true, ward: true, status: true, patientName: true,
        theatrePorterArrivedAtWardTime: true,
        theatrePorterDepartedWardTime: true,
      },
    });
    if (!callUp) return NextResponse.json({ error: 'Call-up not found' }, { status: 404 });

    // A ward nurse is confined to their own ward. Nothing here widens anybody
    // else's reach: canActOnWardCase only narrows the new role.
    const allowed = canActOnWardCase(me, callUp.ward);
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    const arrived = parseTime(body.porterArrivedAtWard);
    const departed = parseTime(body.porterDepartedWard);

    // Compared against what is already stored, not only against each other, so
    // sending one of the two cannot produce a pair that reads backwards.
    const effArrived = arrived !== undefined ? arrived : callUp.theatrePorterArrivedAtWardTime;
    const effDeparted = departed !== undefined ? departed : callUp.theatrePorterDepartedWardTime;
    if (effArrived && effDeparted && effDeparted < effArrived) {
      return NextResponse.json(
        { error: 'The patient cannot have left the ward before the porter arrived.' },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {
      wardEntriesRecordedById: me.id,
      wardEntriesRecordedByName: me.fullName,
      wardEntriesRecordedAt: new Date(),
    };

    if (arrived !== undefined) data.theatrePorterArrivedAtWardTime = arrived;
    if (departed !== undefined) data.theatrePorterDepartedWardTime = departed;

    if (body.notes !== undefined) {
      data.wardEntriesNotes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;
    }

    /**
     * Who handed the patient over.
     *
     * When the ward nurse-in-charge records this themselves they are the nurse
     * who handed over, so their own name is the default rather than a blank
     * box. They may still name a colleague who did it on their shift.
     *
     * NOTE what is NOT set here: `wardNurseSignaturePresent`. That flag means
     * "the holding-area nurse confirms a signature is on the printout". There
     * is no printout in this flow, so setting it would assert a piece of paper
     * that does not exist. `wardEntriesRecordedById` is the stronger record
     * anyway — it names the account, not a signature somebody read.
     */
    if (body.wardNurseName !== undefined) {
      data.wardNurseName = body.wardNurseName
        ? String(body.wardNurseName).trim().slice(0, 160)
        : null;
    } else if (isWardPostedRole(me.role)) {
      data.wardNurseName = me.fullName;
    }

    /**
     * "The patient has gone."
     *
     * Only ever forwards. A call-up at PATIENT_ARRIVED has already been
     * received in the holding area; the ward marking it en route afterwards
     * would replace a later truth with an earlier one and make the journey
     * timeline read backwards. REJECTED and CANCELLED are somebody's decision
     * and are not undone from here either.
     */
    let sentApplied = false;
    if (body.markSent === true) {
      /**
       * The porter times are observations; this is a handover.
       *
       * A clinical health assistant can truthfully say when the porter came
       * and when the patient left, and records both above. Setting
       * PATIENT_EN_ROUTE says something else: the theatre reads it as "this
       * patient is checked and on the way" — identity confirmed, consent
       * signed, notes and films with them. That is the nurse-in-charge's.
       *
       * Checked on the server as well as hidden on the page, because a
       * button that is merely not drawn is not a rule.
       */
      const release = canReleasePatient(me.role);
      if (!release.ok) {
        return NextResponse.json({ error: release.reason }, { status: 403 });
      }
      if (callUp.status === 'INVITED') {
        data.status = 'PATIENT_EN_ROUTE';
        data.patientEnRouteAt = effDeparted ?? new Date();
        sentApplied = true;
      } else if (callUp.status === 'PATIENT_EN_ROUTE') {
        // Already recorded; correcting the time is still allowed.
        if (departed !== undefined && departed) data.patientEnRouteAt = departed;
        sentApplied = true;
      } else {
        return NextResponse.json(
          {
            error:
              `This case is already ${String(callUp.status).toLowerCase().replace(/_/g, ' ')}, `
              + 'so it cannot be marked as only now leaving the ward. '
              + 'The times above can still be corrected.',
          },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.patientCallUp.update({
      where: { id: callUp.id },
      data: data as never,
      select: {
        id: true, status: true, patientEnRouteAt: true,
        theatrePorterArrivedAtWardTime: true,
        theatrePorterDepartedWardTime: true,
        wardNurseName: true, wardEntriesNotes: true,
        wardEntriesRecordedByName: true, wardEntriesRecordedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      sentApplied,
      callUp: {
        id: updated.id,
        status: updated.status,
        patientEnRouteAt: updated.patientEnRouteAt?.toISOString() ?? null,
        porterArrivedAtWard: updated.theatrePorterArrivedAtWardTime?.toISOString() ?? null,
        porterDepartedWard: updated.theatrePorterDepartedWardTime?.toISOString() ?? null,
        wardNurseName: updated.wardNurseName,
        notes: updated.wardEntriesNotes,
        recordedByName: updated.wardEntriesRecordedByName,
        recordedAt: updated.wardEntriesRecordedAt?.toISOString() ?? null,
      },
    });
  } catch (error: any) {
    console.error('Ward desk PATCH error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
