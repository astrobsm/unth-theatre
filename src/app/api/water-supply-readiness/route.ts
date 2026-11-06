import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { readinessAreas } from '@/lib/water/readiness';
import { missingExplanations } from '@/lib/water/waterAreas';
import { escalateWaterReport } from '@/lib/water/escalate';
// Shared with the pre-operative review and the shift water report, so all
// three agree about what a handset fix means. See the note in
// src/app/api/plumbing-water-supply/route.ts.
import { fixColumns, summariseReviewLocation } from '@/lib/anaesthesia/reviewLocation';

export const dynamic = 'force-dynamic';

// Daily readiness must be logged before this hour (West Africa Time, UTC+1).
const DEADLINE_HOUR_WAT = 17; // 5 PM
const WAT_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

// Roles that belong to the Water Supply department (separate from Plumbing).
const WATER_SUPPLY_ROLES = [
  'WATER_SUPPLY_SUPERVISOR',
  'WORKS_SUPERVISOR',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
];

const createReadinessSchema = z.object({
  forDate: z.string().optional(),
  overheadTankLevel: z.number().min(0).max(100).default(0),
  groundTankLevel: z.number().min(0).max(100).default(0),
  restroomsWaterReady: z.boolean().default(false),
  scrubbingWaterReady: z.boolean().default(false),
  theatreActivitiesWaterReady: z.boolean().default(false),
  noShortageConfirmed: z.boolean().default(false),
  overallReadiness: z.enum(['READY', 'AT_RISK', 'NOT_READY']),
  // riskDetails is the problem, under the name this form has always used.
  // Both it and actionTaken become required once anything is not ready --
  // checked below rather than here, so the message names the box.
  riskDetails: z.string().max(2000).optional(),
  actionTaken: z.string().max(2000).optional(),
  /** How the theatres get water on the day this report covers. */
  contingencyPlan: z.string().max(2000).optional(),
  notes: z.string().optional(),
  /** Where the handset was. Optional throughout — see the status route. */
  fix: z.object({
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    accuracyM: z.number().nullable().optional(),
    unavailableReason: z.string().max(300).nullable().optional(),
  }).optional(),
});

// Returns true when the current time (WAT) is at/after the 5 PM cutoff.
function isPastDeadline(now: Date): boolean {
  const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
  return watNow.getUTCHours() >= DEADLINE_HOUR_WAT;
}

// GET - list water-supply readiness reports and today's compliance summary.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30');

    const reports = await prisma.waterSupplyReadiness.findMany({
      include: {
        loggedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { readinessDate: 'desc' },
      take: limit,
    });

    // Compliance for the current day: has a readiness report been logged today?
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    const loggedToday = await prisma.waterSupplyReadiness.findFirst({
      where: { readinessDate: { gte: startOfToday } },
      orderBy: { readinessDate: 'desc' },
    });

    // The readiness faults still waiting to be re-assessed. Same table as
    // the shift report's, deliberately: a hospital has one water problem at
    // a time, not one per form.
    const openIssues = await prisma.waterAreaIssue.findMany({
      where: { resolvedAt: null, areaKey: { startsWith: 'readiness:' } },
      orderBy: { openedAt: 'asc' },
      take: 50,
    }).catch(() => []);

    return NextResponse.json({
      reports,
      openIssues,
      compliance: {
        loggedToday: Boolean(loggedToday),
        pastDeadline: isPastDeadline(new Date()),
        deadlineHourWat: DEADLINE_HOUR_WAT,
      },
    });
  } catch (error) {
    console.error('Error fetching water supply readiness:', error);
    return NextResponse.json({ reports: [], openIssues: [], compliance: { loggedToday: false, pastDeadline: false, deadlineHourWat: DEADLINE_HOUR_WAT } });
  }
}

// POST - log a daily water-supply readiness report.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!WATER_SUPPLY_ROLES.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only water supply staff can log daily readiness' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createReadinessSchema.parse(body);

    // Everything this report says is not ready, in the same shape the shift
    // report uses, so one escalation path serves both forms.
    const areas = readinessAreas(data);
    const missing = missingExplanations(areas, data.contingencyPlan);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          // The readiness form calls the problem "risk details", so the
          // messages are rewritten to name the box the person is looking at
          // rather than a field name they have never seen.
          error: missing
            .map((m) => m
              .replace(/^Say what is wrong in .*$/, 'Say what the problem is.')
              .replace(/^Say what has been done about .*$/, 'Say what has been done about it so far.'))
            .filter((m, i, all) => all.indexOf(m) === i)
            .join(' '),
          details: missing,
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const isLate = isPastDeadline(now);

    // Assessed on the server, never taken from the browser.
    const where = fixColumns(data.fix ?? null);

    // Default the covered surgery day to tomorrow when not supplied.
    const forDate = data.forDate
      ? new Date(data.forDate)
      : new Date(new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000);

    const readiness = await prisma.waterSupplyReadiness.create({
      data: {
        forDate,
        overheadTankLevel: data.overheadTankLevel,
        groundTankLevel: data.groundTankLevel,
        restroomsWaterReady: data.restroomsWaterReady,
        scrubbingWaterReady: data.scrubbingWaterReady,
        theatreActivitiesWaterReady: data.theatreActivitiesWaterReady,
        noShortageConfirmed: data.noShortageConfirmed,
        overallReadiness: data.overallReadiness,
        riskDetails: data.riskDetails || null,
        actionTaken: data.actionTaken || null,
        contingencyPlan: (data.contingencyPlan ?? '').trim() || null,
        notes: data.notes || null,
        loggedLatitude: where.latitude,
        loggedLongitude: where.longitude,
        loggedAccuracyM: where.accuracyM,
        loggedFixVerdict: where.fixVerdict,
        loggedDistanceM: where.distanceM,
        loggedLocationAt: now,
        loggedLocationUnavailableReason: where.unavailableReason,
        submittedAt: now,
        isLate,
        disciplinaryQueryIssued: isLate,
        loggedById: session.user.id,
        loggedByName: session.user.name || '',
      },
      include: {
        loggedBy: { select: { fullName: true, role: true } },
      },
    });

    // A late submission past the 5 PM cutoff raises a disciplinary query
    // notification to management and to the staff member who logged it.
    if (isLate) {
      try {
        const management = await prisma.user.findMany({
          where: {
            status: 'APPROVED',
            role: {
              in: ['THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'WORKS_SUPERVISOR'],
            },
          },
          select: { id: true },
        });

        const recipientIds = new Set<string>(management.map((m) => m.id));
        recipientIds.add(session.user.id);

        await prisma.notification.createMany({
          data: Array.from(recipientIds).map((userId) => ({
            userId,
            type: 'WATER_READINESS_LATE',
            title: '⚠️ Disciplinary Query — Late Water Readiness Log',
            message: `${readiness.loggedByName || 'Water supply staff'} logged the daily water-supply readiness after the 5 PM deadline. A disciplinary query is required.`,
            link: '/dashboard/plumbing-water-supply',
          })),
        });
      } catch (notifyError) {
        console.error('Failed to dispatch late-readiness notifications:', notifyError);
      }
    }

    // Faults opened for each promise that cannot be given, faults closed
    // for the ones this report can now give, and the head of water supply
    // and the head of works chased on WhatsApp. The in-app notification to
    // management that used to live here is raised inside it, so one report
    // produces one alert rather than two.
    //
    // It never throws: the readiness report is already saved, and a saved
    // report that answers 500 gets filed twice.
    const escalation = await escalateWaterReport({
      source: 'READINESS',
      sourceId: readiness.id,
      areas,
      contingencyPlan: (data.contingencyPlan ?? '').trim() || null,
      loggedById: session.user.id,
      loggedByName: session.user.name || '',
      loggedByRole: session.user.role,
      at: now,
      overall: data.overallReadiness,
      overheadTankLevel: data.overheadTankLevel,
      groundTankLevel: data.groundTankLevel,
      locationSentence: summariseReviewLocation(
        data.fix ?? null, 'This readiness report was logged',
      ).sentence,
      forDate: forDate.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos',
      }),
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'WaterSupplyReadiness',
        recordId: readiness.id,
        changes: JSON.stringify({
          overallReadiness: data.overallReadiness,
          isLate,
          forDate,
          contingencyPlan: (data.contingencyPlan ?? '').trim() || null,
          faultsOpened: escalation.opened.map((o) => o.areaName),
          faultsClosed: escalation.closed.map((c) => c.areaName),
          whatsappQueued: escalation.whatsappQueued,
          loggedFrom: where.fixVerdict,
        }),
      },
    });

    return NextResponse.json({ readiness, isLate, escalation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating water supply readiness:', error);
    return NextResponse.json({ error: 'Failed to create water supply readiness' }, { status: 500 });
  }
}
