import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

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
  riskDetails: z.string().optional(),
  actionTaken: z.string().optional(),
  notes: z.string().optional(),
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

    return NextResponse.json({
      reports,
      compliance: {
        loggedToday: Boolean(loggedToday),
        pastDeadline: isPastDeadline(new Date()),
        deadlineHourWat: DEADLINE_HOUR_WAT,
      },
    });
  } catch (error) {
    console.error('Error fetching water supply readiness:', error);
    return NextResponse.json({ reports: [], compliance: { loggedToday: false, pastDeadline: false, deadlineHourWat: DEADLINE_HOUR_WAT } });
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

    const now = new Date();
    const isLate = isPastDeadline(now);

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
        notes: data.notes || null,
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

    // Notify management when next-day water supply is not ready / at risk.
    if (data.overallReadiness !== 'READY') {
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

        if (management.length > 0) {
          await prisma.notification.createMany({
            data: management.map((m) => ({
              userId: m.id,
              type: 'WATER_READINESS_RISK',
              title: `🚰 Water Supply ${data.overallReadiness === 'NOT_READY' ? 'NOT READY' : 'AT RISK'} for Next Surgery`,
              message: `Next-day water-supply readiness is ${data.overallReadiness}. ${data.riskDetails || ''}`.trim(),
              link: '/dashboard/plumbing-water-supply',
            })),
          });
        }
      } catch (notifyError) {
        console.error('Failed to dispatch water-risk notifications:', notifyError);
      }
    }

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
        }),
      },
    });

    return NextResponse.json({ readiness, isLate }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating water supply readiness:', error);
    return NextResponse.json({ error: 'Failed to create water supply readiness' }, { status: 500 });
  }
}
