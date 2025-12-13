import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const startDutySchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  dutyType: z.enum([
    'THEATRE_CLEANING',
    'PATIENT_TRANSPORT',
    'WASHING_MACINTOSH',
    'EQUIPMENT_STERILIZATION',
    'LINEN_MANAGEMENT',
    'WASTE_DISPOSAL',
    'EQUIPMENT_SETUP',
    'OTHER',
  ]),
  dutyDescription: z.string().optional(),
  location: z.string().optional(),
  quantity: z.number().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = startDutySchema.parse(body);

    // Find staff by code
    const staff = await prisma.user.findUnique({
      where: { staffCode: validatedData.staffCode },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
        role: true,
        status: true,
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Invalid staff code' },
        { status: 404 }
      );
    }

    if (staff.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Staff account is not approved' },
        { status: 403 }
      );
    }

    // Check for active duty
    const activeDuty = await prisma.staffDutyLog.findFirst({
      where: {
        staffId: staff.id,
        status: 'IN_PROGRESS',
      },
    });

    if (activeDuty) {
      return NextResponse.json(
        { error: 'You have an active duty session. Please end it first.' },
        { status: 400 }
      );
    }

    // Create duty log
    const dutyLog = await prisma.staffDutyLog.create({
      data: {
        staffId: staff.id,
        staffCode: staff.staffCode!,
        staffName: staff.fullName,
        staffRole: staff.role,
        dutyType: validatedData.dutyType,
        dutyDescription: validatedData.dutyDescription,
        location: validatedData.location,
        quantity: validatedData.quantity,
        notes: validatedData.notes,
        status: 'IN_PROGRESS',
      },
    });

    return NextResponse.json(
      {
        message: 'Duty session started successfully',
        log: dutyLog,
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

    console.error('Error starting duty:', error);
    return NextResponse.json(
      { error: 'Failed to start duty session' },
      { status: 500 }
    );
  }
}
