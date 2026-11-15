/**
 * The Ward Desk: one ward's theatre cases, for the nurse in charge of it.
 *
 * SCOPE IS READ FROM THE DATABASE, NOT FROM THE SESSION.
 *
 * `wardAssignment` is deliberately NOT carried on the JWT beside role and
 * extraModules. A session token lives until it is refreshed, so a posting an
 * administrator corrected this morning would go on scoping this desk to the
 * old ward until the nurse signed out and in again — and the nurse would have
 * no way to tell. One extra user lookup per request is the cost of the ward
 * being right now rather than eventually.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { hasModuleAccess } from '@/lib/modules';
import {
  wardScopeOf,
  normaliseWard,
  isWardPostedRole,
  WARD_ACTIONABLE_SURGERY_STATUSES,
} from '@/lib/ward/nurseInCharge';

export const dynamic = 'force-dynamic';

/** Nigeria (WAT) is UTC+1 with no DST. */
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasModuleAccess(session.user.role, session.user.extraModules, 'ward-desk')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, fullName: true, role: true, wardAssignment: true },
    });
    if (!me) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    /**
     * Whose ward.
     *
     * A ward-posted account — nurse-in-charge or health assistant — is confined
     * to their posting. A theatre manager or administrator reaching this page
     * has no posting at all and would otherwise see an empty desk that looks
     * broken; they may name a ward with ?ward=, and are told plainly that is
     * what is happening.
     */
    const asked = normaliseWard(request.nextUrl.searchParams.get('ward'));
    const scope = wardScopeOf(me);
    let ward: string;
    let viewingAs: 'own' | 'chosen' | 'none';

    if (isWardPostedRole(me.role)) {
      if (!scope.assigned) {
        return NextResponse.json({
          ward: null, viewingAs: 'none', reason: scope.reason, cases: [],
        });
      }
      // Their own ward, whatever the query string says.
      ward = scope.ward;
      viewingAs = 'own';
    } else if (scope.assigned) {
      ward = scope.ward;
      viewingAs = 'own';
    } else if (asked) {
      ward = asked;
      viewingAs = 'chosen';
    } else {
      return NextResponse.json({
        ward: null,
        viewingAs: 'none',
        reason: 'Your account has no ward, so choose one to look at.',
        cases: [],
      });
    }

    /**
     * The window: yesterday to three days ahead.
     *
     * Not "today": a case on this morning's list that has not gone yet is the
     * one the nurse is standing next to, and a case due tomorrow is the one
     * they are preparing for tonight. Yesterday is included because a ward
     * handover written up the next morning is still worth having — that is the
     * work this desk exists to replace.
     */
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setTime(from.getTime() - DAY_MS);
    const to = new Date(from.getTime() + 5 * DAY_MS);

    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: from, lte: to },
        status: { in: WARD_ACTIONABLE_SURGERY_STATUSES as unknown as never[] },
        patient: { ward: { equals: ward, mode: 'insensitive' } },
      },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        magnitude: true,
        status: true,
        surgeryType: true,
        isDayCase: true,
        unit: true,
        location: true,
        surgeonName: true,
        patient: { select: { id: true, name: true, folderNumber: true, ward: true, age: true, ageUnit: true, gender: true } },
        surgeon: { select: { fullName: true } },
        patientCallUps: {
          orderBy: { invitedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            invitedAt: true,
            invitedByName: true,
            theatreName: true,
            patientEnRouteAt: true,
            patientArrivedAt: true,
            theatrePorterArrivedAtWardTime: true,
            theatrePorterDepartedWardTime: true,
            wardNurseName: true,
            wardEntriesNotes: true,
            wardEntriesRecordedByName: true,
            wardEntriesRecordedAt: true,
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    const cases = surgeries.map((s) => {
      const callUp = s.patientCallUps[0] ?? null;
      return {
        surgeryId: s.id,
        patientName: s.patient?.name ?? 'Unknown',
        folderNumber: s.patient?.folderNumber ?? '',
        age: s.patient?.age ?? null,
        ageUnit: s.patient?.ageUnit ?? null,
        gender: s.patient?.gender ?? null,
        ward: s.patient?.ward ?? null,
        procedureName: s.procedureName,
        scheduledDate: s.scheduledDate.toISOString(),
        scheduledTime: s.scheduledTime,
        magnitude: s.magnitude,
        status: s.status,
        surgeryType: s.surgeryType,
        isDayCase: s.isDayCase,
        unit: s.unit,
        location: s.location,
        surgeonName: s.surgeon?.fullName || s.surgeonName || null,
        // Null until the theatre sends for the patient. The ward can do nothing
        // but look until then, which is itself worth showing.
        callUp: callUp
          ? {
              id: callUp.id,
              status: callUp.status,
              theatreName: callUp.theatreName,
              invitedAt: callUp.invitedAt?.toISOString() ?? null,
              invitedByName: callUp.invitedByName,
              patientEnRouteAt: callUp.patientEnRouteAt?.toISOString() ?? null,
              patientArrivedAt: callUp.patientArrivedAt?.toISOString() ?? null,
              porterArrivedAtWard: callUp.theatrePorterArrivedAtWardTime?.toISOString() ?? null,
              porterDepartedWard: callUp.theatrePorterDepartedWardTime?.toISOString() ?? null,
              wardNurseName: callUp.wardNurseName,
              notes: callUp.wardEntriesNotes,
              recordedByName: callUp.wardEntriesRecordedByName,
              recordedAt: callUp.wardEntriesRecordedAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({
      ward,
      viewingAs,
      nurseName: me.fullName,
      role: me.role,
      from: from.toISOString(),
      to: to.toISOString(),
      cases,
    });
  } catch (error: any) {
    console.error('Ward desk GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
