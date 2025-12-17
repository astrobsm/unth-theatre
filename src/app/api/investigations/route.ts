import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const urgency = searchParams.get('urgency');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (urgency) {
      where.urgency = urgency;
    }

    const investigations = await prisma.preoperativeInvestigation.findMany({
      where,
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            status: true,
          },
        },
        patient: {
          select: {
            id: true,
            folderNumber: true,
            name: true,
            age: true,
            gender: true,
            ward: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        sampleCollectedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    return NextResponse.json(investigations);
  } catch (error) {
    console.error('Error fetching investigations:', error);
    return NextResponse.json({ investigations: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const investigation = await prisma.preoperativeInvestigation.create({
      data: {
        surgeryId: data.surgeryId,
        patientId: data.patientId,
        testName: data.testName,
        testCategory: data.testCategory,
        urgency: data.urgency,
        requestedById: session.user.id,
        requestReason: data.requestReason,
        notes: data.notes,
      },
      include: {
        surgery: {
          select: {
            procedureName: true,
            scheduledDate: true,
          },
        },
        patient: {
          select: {
            folderNumber: true,
            name: true,
            ward: true,
          },
        },
        requestedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(investigation);
  } catch (error) {
    console.error('Error creating investigation:', error);
    return NextResponse.json({ error: 'Failed to create investigation' }, { status: 500 });
  }
}
