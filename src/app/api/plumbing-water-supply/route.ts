import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  AREA_STATUSES, areasNotOk, legacyColumnsFor, missingExplanations, summariseAreas,
  type WaterArea,
} from '@/lib/water/waterAreas';
import { escalateWaterReport } from '@/lib/water/escalate';
// Named for the pre-operative review because that is what first needed it,
// but there is nothing anaesthetic about it: it assesses a handset fix on the
// server and says what to store. Reused rather than copied, so a water report
// and a bedside review cannot come to disagree about what "on site" means.
import { fixColumns, summariseReviewLocation } from '@/lib/anaesthesia/reviewLocation';

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
    // Asked for only when the status is not OK, and checked below rather
    // than here: zod cannot say "required when a sibling field is not OK"
    // without a refinement that reports against the wrong field, and the
    // message a plumber sees matters more than where the rule lives.
    problem: z.string().max(2000).optional(),
    actionTaken: z.string().max(2000).optional(),
  })).optional(),
  /** How the theatres get water while whatever is wrong stays wrong. */
  contingencyPlan: z.string().max(2000).optional(),
  /**
   * Where the handset was. Optional throughout: a basement with no signal
   * and a page served over plain http both produce nothing, and a report
   * that could not be filed without a position would not be filed.
   */
  fix: z.object({
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    accuracyM: z.number().nullable().optional(),
    unavailableReason: z.string().max(300).nullable().optional(),
  }).optional(),
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

    // The faults still waiting to be re-assessed.
    //
    // Returned on every read, not only when the faults tab is open: this is
    // the banner across the top of the page, and the whole point of it is
    // that somebody who came to log something else sees that the Eye
    // Theatre has been dry since Tuesday.
    if (type === 'status' || type === 'all' || type === 'issues') {
      result.openIssues = await prisma.waterAreaIssue.findMany({
        where: { resolvedAt: null },
        orderBy: { openedAt: 'asc' },
        take: 100,
      });
      // The last few that were cleared, so a board can show that
      // re-assessment is a thing that actually happens here.
      result.recentlyResolved = await prisma.waterAreaIssue.findMany({
        where: { resolvedAt: { not: null } },
        orderBy: { resolvedAt: 'desc' },
        take: 10,
      });
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
    return NextResponse.json({
      waterStatuses: [], faults: [], stats: {}, openIssues: [], recentlyResolved: [],
    });
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
    const { areaStatuses, contingencyPlan, fix, ...data } = createWaterStatusSchema.parse(body);

    // The old columns are written from the areas where a name still matches,
    // so the two shapes cannot disagree about the same room. Where the client
    // sent no areas at all, whatever it did send in the seven fields stands.
    const areas: WaterArea[] = areaStatuses ?? [];
    const legacy = areas.length > 0 ? legacyColumnsFor(areas) : {};

    // Checked again here although the form already checks it. The form is
    // the client's copy of the rule; this is the rule. A browser left open
    // since before the deploy, an offline queue replaying an old payload and
    // a handset posting from memory all arrive here, and a fault with no
    // description is a summons with no information in it.
    const missing = missingExplanations(areas, contingencyPlan);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: missing.join(' '), details: missing },
        { status: 400 },
      );
    }

    // Assessed on the server, never taken from the browser: a client that
    // could name its own verdict could claim to have walked the theatres
    // from anywhere.
    const where = fixColumns(fix ?? null);
    const loggedAt = new Date();

    const waterStatus = await prisma.plumbingWaterStatus.create({
      data: {
        ...data,
        ...legacy,
        areaStatuses: areas.length > 0 ? JSON.stringify(areas) : null,
        contingencyPlan: (contingencyPlan ?? '').trim() || null,
        loggedLatitude: where.latitude,
        loggedLongitude: where.longitude,
        loggedAccuracyM: where.accuracyM,
        loggedFixVerdict: where.fixVerdict,
        loggedDistanceM: where.distanceM,
        loggedLocationAt: loggedAt,
        loggedLocationUnavailableReason: where.unavailableReason,
        loggedById: session.user.id,
        loggedByName: session.user.name || '',
      },
      include: {
        loggedBy: { select: { fullName: true, role: true } },
      },
    });

    const affected = areasNotOk(areas);

    // Faults opened, faults closed, and the two department heads chased.
    // Everything that happens to the rest of the hospital is in here, and it
    // never throws: the report is already saved, and a saved report that
    // answers 500 is filed twice by a plumber who thinks it failed.
    const escalation = await escalateWaterReport({
      source: 'STATUS',
      sourceId: waterStatus.id,
      areas,
      contingencyPlan: (contingencyPlan ?? '').trim() || null,
      loggedById: session.user.id,
      loggedByName: session.user.name || '',
      loggedByRole: session.user.role,
      at: loggedAt,
      overall: data.overallStatus,
      overheadTankLevel: data.overheadTankLevel,
      groundTankLevel: data.groundTankLevel,
      locationSentence: summariseReviewLocation(
        fix ?? null, 'This water report was logged',
      ).sentence,
    });

    // The overall-status alarm still fires, but only where the escalation
    // above has not already named the rooms. Two notifications about one
    // morning's water teach people to swipe both away.
    if (affected.length === 0
      && (data.overallStatus === 'CRITICAL' || data.overallStatus === 'OFFLINE')) {
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
            // The rooms are named either way. A theatre manager reading
            // this on a phone at 6am needs to know whether their list can
            // run, and "water is CRITICAL" does not tell them that. Here
            // every room was reported OK -- the alarm is on the supply
            // itself -- and saying so is the useful thing.
            message: `Water supply is ${data.overallStatus}. Municipal: ${data.municipalWaterAvailable ? 'Yes' : 'No'}, Borehole: ${data.boreholeOperational ? 'Yes' : 'No'}, Tank: ${data.overheadTankLevel}%.`
              + (areas.length > 0 ? ` Rooms: ${summariseAreas(areas, 6)}.` : '')
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
          contingencyPlan: (contingencyPlan ?? '').trim() || null,
          faultsOpened: escalation.opened.map((o) => o.areaName),
          faultsClosed: escalation.closed.map((c) => c.areaName),
          whatsappQueued: escalation.whatsappQueued,
          loggedFrom: where.fixVerdict,
        }),
      },
    });

    // The hand-offs are the part that actually reaches a phone tonight: the
    // queue waits on a provider the theatre server does not have.
    return NextResponse.json({ ...waterStatus, escalation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating water status:', error);
    return NextResponse.json({ error: 'Failed to create water status' }, { status: 500 });
  }
}
