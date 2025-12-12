import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get all intra-operative records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active') === 'true';

    const where: any = {};
    
    if (active) {
      where.transferToPACUTime = null;
    }

    const records = await prisma.intraOperativeRecord.findMany({
      where,
      include: {
        surgery: {
          include: {
            patient: {
              select: {
                id: true,
                folderNumber: true,
                name: true,
                age: true,
                gender: true
              }
            },
            surgeon: {
              select: {
                fullName: true,
                email: true
              }
            },
            anesthetist: {
              select: {
                fullName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('Error fetching intra-operative records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch records' },
      { status: 500 }
    );
  }
}

// POST - Create new intra-operative record
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Surgeons, anesthetists, nurses can create records
    const allowedRoles = [
      'SURGEON', 'ANAESTHETIST', 'NURSE_ANAESTHETIST', 
      'SCRUB_NURSE', 'CIRCULATING_NURSE', 
      'ADMIN', 'THEATRE_MANAGER'
    ];

    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { surgeryId, primarySurgeonId } = body;

    // Check if record already exists
    const existing = await prisma.intraOperativeRecord.findUnique({
      where: { surgeryId }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Intra-operative record already exists for this surgery' },
        { status: 400 }
      );
    }

    const record = await prisma.intraOperativeRecord.create({
      data: {
        surgeryId,
        primarySurgeonId,
        createdBy: session.user.id,
        ...body
      },
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: true,
            anesthetist: true
          }
        }
      }
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Error creating intra-operative record:', error);
    return NextResponse.json(
      { error: 'Failed to create record' },
      { status: 500 }
    );
  }
}
