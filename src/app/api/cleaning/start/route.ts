import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const startCleaningSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  theatreId: z.string().min(1, 'Theatre ID is required'),
  cleaningType: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = startCleaningSchema.parse(body);

    // Find user by staff code
    const user = await prisma.user.findUnique({
      where: { staffCode: validatedData.staffCode },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid staff code' },
        { status: 404 }
      );
    }

    if (user.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Staff account is not approved' },
        { status: 403 }
      );
    }

    if (user.role !== 'CLEANER' && user.role !== 'ADMIN' && user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json(
        { error: 'Only cleaners and administrators can log cleaning duties' },
        { status: 403 }
      );
    }

    // Check if there's already an active cleaning log for this cleaner
    const activeLog = await prisma.theatreCleaningLog.findFirst({
      where: {
        cleanerId: user.id,
        status: 'IN_PROGRESS',
      },
    });

    if (activeLog) {
      return NextResponse.json(
        { error: 'You have an active cleaning session. Please end it first.' },
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

    // Create cleaning log
    const cleaningLog = await prisma.theatreCleaningLog.create({
      data: {
        cleanerId: user.id,
        cleanerCode: user.staffCode!,
        cleanerName: user.fullName,
        theatreId: theatre.id,
        theatreName: theatre.name,
        cleaningType: validatedData.cleaningType,
        notes: validatedData.notes,
        status: 'IN_PROGRESS',
      },
    });

    return NextResponse.json(
      {
        message: 'Cleaning session started successfully',
        log: cleaningLog,
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

    console.error('Error starting cleaning:', error);
    return NextResponse.json(
      { error: 'Failed to start cleaning session' },
      { status: 500 }
    );
  }
}
