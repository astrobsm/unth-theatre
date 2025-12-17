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

    const incidents = await prisma.incidentReport.findMany({
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        investigatedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        incidentDate: 'desc',
      },
    });

    return NextResponse.json(incidents);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json({ incidents: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const incident = await prisma.incidentReport.create({
      data: {
        incidentDate: data.incidentDate ? new Date(data.incidentDate) : new Date(),
        incidentType: data.incidentType,
        severity: data.severity,
        location: data.location,
        description: data.description,
        reportedById: session.user.id,
        witnessesPresent: data.witnessesPresent || false,
        witnessNames: data.witnessNames,
        injuriesReported: data.injuriesReported || false,
        injuryDetails: data.injuryDetails,
        damagesReported: data.damagesReported || false,
        damageDetails: data.damageDetails,
        investigationRequired: data.investigationRequired !== false,
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

    return NextResponse.json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }
}
