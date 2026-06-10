import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const startSetupSchema = z.object({
  theatreId: z.string().min(1, 'Theatre ID is required'),
  allocationId: z.string().optional(),
  assignedTheatreId: z.string().optional(),
  assignedTheatreName: z.string().optional(),
  theatreChangeReason: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationName: z.string().min(1, 'Location name is required'),
  locationAddress: z.string().optional(),
  locationAccuracy: z.number().optional(),
  distanceFromFacility: z.number().optional(),
  setupDate: z.string(), // ISO date string
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an anaesthetic technician or admin
    if (!['ANAESTHETIC_TECHNICIAN', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anaesthetic technicians and administrators can log setup' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = startSetupSchema.parse(body);

    // Check for existing setup log for this theatre and date
    const existingLog = await prisma.anesthesiaSetupLog.findFirst({
      where: {
        theatreId: validatedData.theatreId,
        setupDate: new Date(validatedData.setupDate),
        status: { in: ['IN_PROGRESS', 'READY'] },
      },
    });

    if (existingLog) {
      return NextResponse.json(
        { error: 'Setup already logged for this theatre today' },
        { status: 400 }
      );
    }

    // Get theatre details - support lookup by UUID or by name
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validatedData.theatreId);
    let theatre = isUUID
      ? await prisma.theatreSuite.findUnique({
          where: { id: validatedData.theatreId },
          select: { id: true, name: true },
        })
      : await prisma.theatreSuite.findUnique({
          where: { name: validatedData.theatreId },
          select: { id: true, name: true },
        });

    // Auto-create theatre if it doesn't exist (seeding from constants list)
    if (!theatre) {
      theatre = await prisma.theatreSuite.create({
        data: {
          name: validatedData.theatreId,
          location: 'UNTH Theatre Complex',
        },
        select: { id: true, name: true },
      });
    }

    // Determine whether the technician changed away from their assigned theatre.
    const assignedTheatreId = validatedData.assignedTheatreId || null;
    const assignedTheatreName = validatedData.assignedTheatreName || null;
    const theatreChanged = !!assignedTheatreId && assignedTheatreId !== theatre.id;
    const changeReason = (validatedData.theatreChangeReason || '').trim();

    // A change of theatre away from the assignment must be justified for audit.
    if (theatreChanged && changeReason.length < 5) {
      return NextResponse.json(
        { error: 'A reason (min 5 characters) is required when setting up a theatre different from your assigned theatre.' },
        { status: 400 }
      );
    }

    // Create setup log
    const setupLog = await prisma.anesthesiaSetupLog.create({
      data: {
        technicianId: session.user.id,
        technicianName: session.user.name || 'Unknown',
        technicianCode: undefined,
        theatreId: theatre.id,
        theatreName: theatre.name,
        allocationId: validatedData.allocationId,
        assignedTheatreId,
        assignedTheatreName,
        theatreChanged,
        theatreChangeReason: theatreChanged ? changeReason : null,
        setupDate: new Date(validatedData.setupDate),
        latitude: validatedData.latitude,
        longitude: validatedData.longitude,
        locationName: validatedData.locationName,
        locationAddress: validatedData.locationAddress,
        locationAccuracy: validatedData.locationAccuracy,
        distanceFromFacility: validatedData.distanceFromFacility,
        status: 'IN_PROGRESS',
      },
    });

    // Audit trail when the technician deviates from the assigned theatre.
    if (theatreChanged) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'THEATRE_CHANGE_ON_SETUP',
            tableName: 'anesthesia_setup_logs',
            recordId: setupLog.id,
            changes: JSON.stringify({
              assignedTheatreId,
              assignedTheatreName,
              actualTheatreId: theatre.id,
              actualTheatreName: theatre.name,
              reason: changeReason,
              technicianName: session.user.name || 'Unknown',
            }),
          },
        });
      } catch (auditError) {
        console.error('Failed to write theatre-change audit log:', auditError);
      }
    }

    return NextResponse.json(
      {
        message: 'Anesthesia setup started successfully',
        setupLog,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error starting anesthesia setup:', error);
    return NextResponse.json(
      { error: 'Failed to start setup' },
      { status: 500 }
    );
  }
}
