import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const startSetupSchema = z.object({
  theatreId: z.string().min(1, 'Theatre ID is required'),
  allocationId: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationName: z.string().min(1, 'Location name is required'),
  locationAddress: z.string().optional(),
  setupDate: z.string(), // ISO date string
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an anaesthetic technician
    if (session.user.role !== 'ANAESTHETIC_TECHNICIAN') {
      return NextResponse.json(
        { error: 'Only anaesthetic technicians can log setup' },
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

    // Get theatre details
    const theatre = await prisma.theatreSuite.findUnique({
      where: { id: validatedData.theatreId },
      select: { id: true, name: true },
    });

    if (!theatre) {
      return NextResponse.json(
        { error: 'Theatre not found' },
        { status: 404 }
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
        setupDate: new Date(validatedData.setupDate),
        latitude: validatedData.latitude,
        longitude: validatedData.longitude,
        locationName: validatedData.locationName,
        locationAddress: validatedData.locationAddress,
        status: 'IN_PROGRESS',
      },
    });

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
