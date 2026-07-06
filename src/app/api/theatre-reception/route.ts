import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  triggerRadio,
  speak3,
  acknowledgeRadioByMetadata,
  getOnDutyPortersCleanersWithIds,
} from '@/lib/radioEvents';

export const dynamic = 'force-dynamic';

/**
 * Scrub / circulating nurse "Theatre Patient Reception & Workflow" module.
 *
 * GET  -> today's cases (with case-flow state) + selectable porters / cleaners.
 * POST -> action-driven workflow:
 *   receive            : confirm patient received from holding area (announce)
 *   complete-surgery   : mark the surgery completed
 *   call-cleaners      : invite cleaners over the radio (repeats every 3 min)
 *   cleaners-started   : acknowledge cleaners arrived (stops the repeat)
 *   cleaning-complete  : announce holding area to send the next patient
 */

function parseNames(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function namesPhrase(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return '';
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(', ')}, and ${n[n.length - 1]}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [surgeries, allocations, theatres, onDuty] =
      await Promise.all([
        prisma.surgery.findMany({
          where: {
            scheduledDate: { gte: startOfDay, lte: endOfDay },
            status: { not: 'CANCELLED' },
          },
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                folderNumber: true,
                age: true,
                gender: true,
                ward: true,
              },
            },
            surgeon: { select: { fullName: true } },
            caseFlow: true,
          },
          orderBy: [{ scheduledTime: 'asc' }],
        }),
        prisma.theatreAllocation.findMany({
          where: { date: { gte: startOfDay, lte: endOfDay } },
          include: { theatre: { select: { id: true, name: true } } },
        }),
        prisma.theatreSuite.findMany({ select: { id: true, name: true } }),
        // Porters & cleaners ON DUTY for the target day/shift.
        getOnDutyPortersCleanersWithIds(targetDate),
      ]);

    // Use the on-duty staff; fall back to the full approved list only when no
    // roster has been uploaded for the shift (so reception is never blocked).
    let porters: { id: string; fullName: string; staffCode: string | null }[] =
      onDuty.porters.map((p) => ({ id: p.id, fullName: p.fullName, staffCode: p.staffCode }));
    let cleaners: { id: string; fullName: string; staffCode: string | null }[] =
      onDuty.cleaners.map((c) => ({ id: c.id, fullName: c.fullName, staffCode: c.staffCode }));
    if (porters.length === 0) {
      porters = await prisma.user.findMany({
        where: { role: 'PORTER' },
        select: { id: true, fullName: true, staffCode: true },
        orderBy: { fullName: 'asc' },
      });
    }
    if (cleaners.length === 0) {
      cleaners = await prisma.user.findMany({
        where: { role: 'CLEANER' },
        select: { id: true, fullName: true, staffCode: true },
        orderBy: { fullName: 'asc' },
      });
    }

    const theatreNameById: Record<string, string> = {};
    for (const t of theatres) theatreNameById[t.id] = t.name;

    const allocBySurgery: Record<string, { id: string; name: string } | null> =
      {};
    for (const a of allocations) {
      if (a.surgeryId && a.theatre) {
        allocBySurgery[a.surgeryId] = a.theatre;
      }
    }

    const cases = surgeries.map((s) => {
      const alloc = allocBySurgery[s.id] || null;
      const theatreName =
        alloc?.name ||
        (s.theatreId ? theatreNameById[s.theatreId] : null) ||
        s.location ||
        'Theatre';
      const theatreId = alloc?.id || s.theatreId || null;
      const cf = s.caseFlow;
      return {
        surgeryId: s.id,
        status: s.status,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        subspecialty: s.subspecialty,
        unit: s.unit,
        surgeonName: s.surgeon?.fullName || s.surgeonName || null,
        theatreId,
        theatreName,
        patient: s.patient,
        flow: cf
          ? {
              patientReceived: cf.patientReceived,
              patientReceivedAt: cf.patientReceivedAt,
              porterNames: parseNames(cf.porterNames),
              surgeryCompleted: cf.surgeryCompleted,
              surgeryCompletedAt: cf.surgeryCompletedAt,
              cleaningCalled: cf.cleaningCalled,
              cleaningCalledAt: cf.cleaningCalledAt,
              cleanersStarted: cf.cleanersStarted,
              cleanersStartedAt: cf.cleanersStartedAt,
              cleanerNames: parseNames(cf.cleanerNames),
              cleaningCompleted: cf.cleaningCompleted,
              cleaningCompletedAt: cf.cleaningCompletedAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      cases,
      porters,
      cleaners,
      userRole: (session.user as any).role || null,
    });
  } catch (err) {
    console.error('[theatre-reception] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load theatre reception data' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id as string;

    const body = await request.json();
    const action: string = body.action;
    const surgeryId: string = body.surgeryId;

    if (!action || !surgeryId) {
      return NextResponse.json(
        { error: 'action and surgeryId are required' },
        { status: 400 },
      );
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      include: {
        patient: { select: { name: true } },
        caseFlow: true,
      },
    });
    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    const theatreName: string =
      body.theatreName || surgery.location || 'Theatre';
    const theatreId: string | null = body.theatreId || surgery.theatreId || null;
    const patientName = surgery.patient?.name || 'The patient';

    // Ensure a case-flow row exists
    const existing = surgery.caseFlow;

    switch (action) {
      case 'receive': {
        const porterNames: string[] = Array.isArray(body.porterNames)
          ? body.porterNames.filter(Boolean)
          : [];
        const porterIds: string[] = Array.isArray(body.porterIds)
          ? body.porterIds.filter(Boolean)
          : [];

        const data = {
          theatreId,
          theatreName,
          patientReceived: true,
          patientReceivedAt: new Date(),
          receivedById: userId,
          porterNames: JSON.stringify(porterNames),
          porterIds: JSON.stringify(porterIds),
        };
        await prisma.theatreCaseFlow.upsert({
          where: { surgeryId },
          update: data,
          create: { surgeryId, ...data },
        });

        // Move the surgery into progress
        await prisma.surgery.update({
          where: { id: surgeryId },
          data: {
            status: 'IN_PROGRESS',
            actualStartTime: surgery.actualStartTime ?? new Date(),
          },
        });

        const fromPhrase = porterNames.length
          ? ` brought in by ${namesPhrase(porterNames)}`
          : '';
        const line = `${patientName} has been received in ${theatreName}${fromPhrase}.`;
        await triggerRadio({
          category: 'WORKFLOW',
          title: 'Patient Received',
          message: speak3(line),
          priority: 70,
          urgency: 'MEDIUM',
          location: theatreName,
          triggeredById: userId,
          metadata: {
            source: 'PatientReceived',
            surgeryId,
            theatreId,
            tripleRepeat: true,
          },
        });

        return NextResponse.json({ success: true, message: 'Patient received' });
      }

      case 'complete-surgery': {
        if (!existing?.patientReceived) {
          return NextResponse.json(
            { error: 'Patient has not been received yet' },
            { status: 400 },
          );
        }
        const now = new Date();
        await prisma.theatreCaseFlow.update({
          where: { surgeryId },
          data: {
            surgeryCompleted: true,
            surgeryCompletedAt: now,
            surgeryCompletedById: userId,
          },
        });
        await prisma.surgery.update({
          where: { id: surgeryId },
          data: {
            status: 'COMPLETED',
            surgeryEndTime: surgery.surgeryEndTime ?? now,
            actualEndTime: surgery.actualEndTime ?? now,
            completedAt: surgery.completedAt ?? now,
          },
        });
        return NextResponse.json({
          success: true,
          message: 'Surgery marked completed',
        });
      }

      case 'call-cleaners': {
        if (!existing) {
          return NextResponse.json(
            { error: 'No active case for this theatre' },
            { status: 400 },
          );
        }
        await prisma.theatreCaseFlow.update({
          where: { surgeryId },
          data: {
            cleaningCalled: true,
            cleaningCalledAt: new Date(),
            cleaningCalledById: userId,
            // reset any prior cleaning progress for a fresh call
            cleanersStarted: false,
            cleanersStartedAt: null,
            cleaningCompleted: false,
            cleaningCompletedAt: null,
          },
        });

        const line = `Cleaners are needed in ${theatreName}. Please proceed to ${theatreName} to clean immediately.`;
        await triggerRadio({
          category: 'STAFF_REQUEST',
          title: 'Cleaners Requested',
          message: speak3(line),
          priority: 80,
          urgency: 'HIGH',
          location: theatreName,
          requireAck: true,
          repeatUntilAck: true,
          repeatEverySec: 180, // repeat every 3 minutes until acknowledged
          triggeredById: userId,
          metadata: {
            source: 'CleanerCall',
            surgeryId,
            theatreId,
            tripleRepeat: true,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Cleaners called — announcing every 3 minutes until acknowledged',
        });
      }

      case 'cleaners-started': {
        const cleanerNames: string[] = Array.isArray(body.cleanerNames)
          ? body.cleanerNames.filter(Boolean)
          : [];
        const cleanerIds: string[] = Array.isArray(body.cleanerIds)
          ? body.cleanerIds.filter(Boolean)
          : [];

        await prisma.theatreCaseFlow.update({
          where: { surgeryId },
          data: {
            cleanersStarted: true,
            cleanersStartedAt: new Date(),
            cleanerNames: JSON.stringify(cleanerNames),
            cleanerIds: JSON.stringify(cleanerIds),
          },
        });

        // Stop the repeating cleaner-call announcement for this case
        await acknowledgeRadioByMetadata('surgeryId', surgeryId, userId);

        return NextResponse.json({
          success: true,
          message: 'Cleaning acknowledged — announcement stopped',
        });
      }

      case 'cleaning-complete': {
        if (!existing?.cleanersStarted) {
          return NextResponse.json(
            { error: 'Cleaning has not started yet' },
            { status: 400 },
          );
        }
        await prisma.theatreCaseFlow.update({
          where: { surgeryId },
          data: {
            cleaningCompleted: true,
            cleaningCompletedAt: new Date(),
            cleaningCompletedById: userId,
          },
        });

        const line = `Cleaning in ${theatreName} is complete. Holding area nurse, please transfer the next patient for ${theatreName}.`;
        await triggerRadio({
          category: 'WORKFLOW',
          title: 'Theatre Ready — Send Next Patient',
          message: speak3(line),
          priority: 72,
          urgency: 'MEDIUM',
          location: theatreName,
          triggeredById: userId,
          metadata: {
            source: 'CleaningComplete',
            surgeryId,
            theatreId,
            tripleRepeat: true,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Cleaning complete — holding area notified',
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error('[theatre-reception] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to process theatre reception action' },
      { status: 500 },
    );
  }
}
