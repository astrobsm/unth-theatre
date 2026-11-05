import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  AREA_STATUSES, areasNotOk, legacyColumnsFor, summariseAreas, type WaterArea,
} from '@/lib/water/waterAreas';

export const dynamic = 'force-dynamic';

// ===== Water Status Schema =====
const createWaterStatusSchema = z.object({
  shiftType: z.enum(['MORNING', 'AFTERNOON', 'NIGHT']),
  municipalWaterAvailable: z.boolean(),
  boreholeOperational: z.boolean(),
  overheadTankLevel: z.number().min(0).max(100),
  groundTankLevel: z.number().min(0).max(100),
  mainPumpOperational: z.boolean(),
  backupPumpOperational: z.boolean(),
  boosterPumpOperational: z.boolean(),
  mainLinePressure: z.enum(['LOW', 'NORMAL', 'HIGH']),
  theatreLinePressure: z.enum(['LOW', 'NORMAL', 'HIGH']),
  hotWaterAvailable: z.boolean(),
  hotWaterTemperature: z.string().optional(),
  boilerOperational: z.boolean(),
  // Every room this shift was asked about. Optional because a client that
  // has not been reloaded since the deploy still posts the seven fields
  // below, and a plumber mid-shift should not meet a validation error.
  areaStatuses: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    location: z.string().default(''),
    status: z.enum(AREA_STATUSES),
  })).optional(),
  theatre1Status: z.string().default('OK'),
  theatre2Status: z.string().default('OK'),
  theatre3Status: z.string().default('OK'),
  theatre4Status: z.string().default('OK'),
  scrubAreaStatus: z.string().default('OK'),
  recoveryAreaStatus: z.string().default('OK'),
  sterilizationAreaStatus: z.string().default('OK'),
  drainageFlowing: z.boolean(),
  drainageIssues: z.string().optional(),
  overallStatus: z.enum(['OPERATIONAL', 'DEGRADED', 'CRITICAL', 'OFFLINE']),
  actionRequired: z.string().optional(),
  actionTaken: z.string().optional(),
  notes: z.string().optional(),
});

// GET - Fetch water status logs and plumbing faults
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'status' | 'faults' | 'all'
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');

    const result: any = {};

    // Fetch water status logs
    if (type === 'status' || type === 'all') {
      const waterStatuses = await prisma.plumbingWaterStatus.findMany({
        include: {
          loggedBy: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { statusDate: 'desc' },
        take: limit,
      });
      result.waterStatuses = waterStatuses;

      // Get latest status
      if (waterStatuses.length > 0) {
        result.latestStatus = waterStatuses[0];
      }
    }

    // Fetch plumbing faults
    if (type === 'faults' || type === 'all') {
      const faultWhere: any = {};
      if (status) faultWhere.status = status;
      if (priority) faultWhere.priority = priority;
      if (category) faultWhere.category = category;

      const faults = await prisma.plumbingFault.findMany({
        where: faultWhere,
        include: {
          reportedBy: { select: { id: true, fullName: true, role: true } },
          assignedTo: { select: { id: true, fullName: true, role: true } },
          acknowledgedBy: { select: { id: true, fullName: true } },
          resolvedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [
          { priority: 'asc' },
          { reportedAt: 'desc' },
        ],
        take: limit,
      });
      result.faults = faults;
    }

    // Stats
    if (type === 'all') {
      const [totalFaults, openFaults, criticalFaults, resolvedToday] = await Promise.all([
        prisma.plumbingFault.count(),
        prisma.plumbingFault.count({ where: { status: { in: ['REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
        prisma.plumbingFault.count({ where: { priority: 'CRITICAL', status: { not: 'RESOLVED' } } }),
        prisma.plumbingFault.count({
          where: {
            status: 'RESOLVED',
            resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
      ]);
      result.stats = { totalFaults, openFaults, criticalFaults, resolvedToday };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching plumbing/water data:', error);
    return NextResponse.json({ waterStatuses: [], faults: [], stats: {} });
  }
}

// POST - Create a new water status log
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['PLUMBER', 'WORKS_SUPERVISOR', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Only plumbing/works staff can log water status' }, { status: 403 });
    }

    const body = await request.json();
    const { areaStatuses, ...data } = createWaterStatusSchema.parse(body);

    // The old columns are written from the areas where a name still matches,
    // so the two shapes cannot disagree about the same room. Where the client
    // sent no areas at all, whatever it did send in the seven fields stands.
    const areas: WaterArea[] = areaStatuses ?? [];
    const legacy = areas.length > 0 ? legacyColumnsFor(areas) : {};

    const waterStatus = await prisma.plumbingWaterStatus.create({
      data: {
        ...data,
        ...legacy,
        areaStatuses: areas.length > 0 ? JSON.stringify(areas) : null,
        loggedById: session.user.id,
        loggedByName: session.user.name || '',
      },
      include: {
        loggedBy: { select: { fullName: true, role: true } },
      },
    });

    const affected = areasNotOk(areas);

    // If critical status, create notifications
    if (data.overallStatus === 'CRITICAL' || data.overallStatus === 'OFFLINE') {
      const managementStaff = await prisma.user.findMany({
        where: {
          role: { in: ['THEATRE_MANAGER', 'ADMIN', 'WORKS_SUPERVISOR', 'CHIEF_MEDICAL_DIRECTOR'] },
          status: 'APPROVED',
        },
        select: { id: true },
      });

      const notifPromises = managementStaff.map(staff =>
        prisma.notification.create({
          data: {
            userId: staff.id,
            type: 'PLUMBING_CRITICAL',
            title: `🚰 WATER SUPPLY ${data.overallStatus}`,
            // The affected rooms are named. A theatre manager reading this
            // on a phone at 6am needs to know whether their list can run,
            // and "water is CRITICAL" does not tell them that.
            message: `Water supply is ${data.overallStatus}. Municipal: ${data.municipalWaterAvailable ? 'Yes' : 'No'}, Borehole: ${data.boreholeOperational ? 'Yes' : 'No'}, Tank: ${data.overheadTankLevel}%.`
              + (affected.length > 0 ? ` Affected: ${summariseAreas(areas, 6)}.` : '')
              + (data.actionRequired ? ` ${data.actionRequired}` : ''),
            link: '/dashboard/plumbing-water-supply',
          },
        })
      );
      await Promise.all(notifPromises);
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'PlumbingWaterStatus',
        recordId: waterStatus.id,
        changes: JSON.stringify({
          overallStatus: data.overallStatus,
          shiftType: data.shiftType,
          overheadTankLevel: data.overheadTankLevel,
          areasChecked: areas.length,
          areasAffected: affected.map((a) => `${a.name}: ${a.status}`),
        }),
      },
    });

    return NextResponse.json(waterStatus, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating water status:', error);
    return NextResponse.json({ error: 'Failed to create water status' }, { status: 500 });
  }
}
