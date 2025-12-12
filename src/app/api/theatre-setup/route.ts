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

    const setups = await prisma.theatreSetup.findMany({
      include: {
        theatre: {
          select: {
            name: true,
            location: true,
          },
        },
        nurse: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        collectionTime: 'desc',
      },
    });

    return NextResponse.json(setups);
  } catch (error) {
    console.error('Failed to fetch theatre setups:', error);
    return NextResponse.json({ error: 'Failed to fetch setups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      theatreId,
      setupDate,
      latitude,
      longitude,
      location,
      spiritQuantity,
      savlonQuantity,
      povidoneQuantity,
      faceMaskQuantity,
      nursesCapQuantity,
      cssdGauzeQuantity,
      cssdCottonQuantity,
      surgicalBladesQuantity,
      suctionTubbingsQuantity,
      disposablesQuantity,
      notes,
    } = body;

    if (!theatreId || !setupDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create theatre setup record
    const setup = await prisma.theatreSetup.create({
      data: {
        theatreId,
        collectedBy: session.user.id,
        setupDate: new Date(setupDate),
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        location,
        spiritQuantity: spiritQuantity || 0,
        savlonQuantity: savlonQuantity || 0,
        povidoneQuantity: povidoneQuantity || 0,
        faceMaskQuantity: faceMaskQuantity || 0,
        nursesCapQuantity: nursesCapQuantity || 0,
        cssdGauzeQuantity: cssdGauzeQuantity || 0,
        cssdCottonQuantity: cssdCottonQuantity || 0,
        surgicalBladesQuantity: surgicalBladesQuantity || 0,
        suctionTubbingsQuantity: suctionTubbingsQuantity || 0,
        disposablesQuantity: disposablesQuantity || 0,
        notes,
        status: 'COLLECTED',
      },
      include: {
        theatre: true,
        nurse: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'COLLECT_THEATRE_MATERIALS',
        tableName: 'THEATRE_SETUP',
        recordId: setup.id,
        changes: JSON.stringify({
          theatreId,
          totalItems:
            (spiritQuantity || 0) +
            (savlonQuantity || 0) +
            (povidoneQuantity || 0) +
            (faceMaskQuantity || 0) +
            (nursesCapQuantity || 0) +
            (cssdGauzeQuantity || 0) +
            (cssdCottonQuantity || 0) +
            (surgicalBladesQuantity || 0) +
            (suctionTubbingsQuantity || 0) +
            (disposablesQuantity || 0),
        }),
      },
    });

    return NextResponse.json(setup, { status: 201 });
  } catch (error) {
    console.error('Failed to create theatre setup:', error);
    return NextResponse.json({ error: 'Failed to create setup' }, { status: 500 });
  }
}
