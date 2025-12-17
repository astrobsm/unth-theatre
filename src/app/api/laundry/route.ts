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
    const date = searchParams.get('date');

    const where: any = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.reportDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const laundryReports = await prisma.laundryReadiness.findMany({
      where,
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        reportDate: 'desc',
      },
    });

    return NextResponse.json(laundryReports);
  } catch (error) {
    console.error('Error fetching laundry reports:', error);
    return NextResponse.json({ laundryReports: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const laundryReport = await prisma.laundryReadiness.create({
      data: {
        reportDate: data.reportDate ? new Date(data.reportDate) : new Date(),
        shiftType: data.shiftType,
        surgicalGownsClean: data.surgicalGownsClean || 0,
        surgicalDrapesClean: data.surgicalDrapesClean || 0,
        patientGownsClean: data.patientGownsClean || 0,
        bedSheetsClean: data.bedSheetsClean || 0,
        towelsClean: data.towelsClean || 0,
        scrubSuitsClean: data.scrubSuitsClean || 0,
        theatre1Allocated: data.theatre1Allocated || false,
        theatre2Allocated: data.theatre2Allocated || false,
        theatre3Allocated: data.theatre3Allocated || false,
        theatre4Allocated: data.theatre4Allocated || false,
        overallReadiness: data.overallReadiness,
        criticalShortages: data.criticalShortages,
        surgicalGownsUsed: data.surgicalGownsUsed || 0,
        surgicalDrapesUsed: data.surgicalDrapesUsed || 0,
        patientGownsUsed: data.patientGownsUsed || 0,
        notes: data.notes,
        reportedById: session.user.id,
      },
      include: {
        reportedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(laundryReport);
  } catch (error) {
    console.error('Error creating laundry report:', error);
    return NextResponse.json({ error: 'Failed to create laundry report' }, { status: 500 });
  }
}
