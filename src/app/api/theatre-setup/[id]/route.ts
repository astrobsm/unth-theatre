import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// GET single theatre setup by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const setup = await prisma.theatreSetup.findUnique({
      where: { id },
      include: {
        theatre: true,
        nurse: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        returns: {
          include: {
            nurse: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!setup) {
      return NextResponse.json({ error: 'Theatre setup not found' }, { status: 404 });
    }

    return NextResponse.json(setup);
  } catch (error) {
    console.error('Error fetching theatre setup:', error);
    return NextResponse.json({ error: 'Failed to fetch theatre setup' }, { status: 500 });
  }
}

// PUT update theatre setup
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();

    const existingSetup = await prisma.theatreSetup.findUnique({
      where: { id },
    });

    if (!existingSetup) {
      return NextResponse.json({ error: 'Theatre setup not found' }, { status: 404 });
    }

    // Only allow updates if status is COLLECTED (not yet returned)
    if (existingSetup.status === 'RETURNED') {
      return NextResponse.json(
        { error: 'Cannot update a returned setup' },
        { status: 400 }
      );
    }

    const {
      status,
      notes,
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
    } = body;

    const updateData: any = {};

    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (spiritQuantity !== undefined) updateData.spiritQuantity = spiritQuantity;
    if (savlonQuantity !== undefined) updateData.savlonQuantity = savlonQuantity;
    if (povidoneQuantity !== undefined) updateData.povidoneQuantity = povidoneQuantity;
    if (faceMaskQuantity !== undefined) updateData.faceMaskQuantity = faceMaskQuantity;
    if (nursesCapQuantity !== undefined) updateData.nursesCapQuantity = nursesCapQuantity;
    if (cssdGauzeQuantity !== undefined) updateData.cssdGauzeQuantity = cssdGauzeQuantity;
    if (cssdCottonQuantity !== undefined) updateData.cssdCottonQuantity = cssdCottonQuantity;
    if (surgicalBladesQuantity !== undefined) updateData.surgicalBladesQuantity = surgicalBladesQuantity;
    if (suctionTubbingsQuantity !== undefined) updateData.suctionTubbingsQuantity = suctionTubbingsQuantity;
    if (disposablesQuantity !== undefined) updateData.disposablesQuantity = disposablesQuantity;

    const updatedSetup = await prisma.theatreSetup.update({
      where: { id },
      data: updateData,
      include: {
        theatre: true,
        nurse: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'theatre_setups',
        recordId: id,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(updatedSetup);
  } catch (error) {
    console.error('Error updating theatre setup:', error);
    return NextResponse.json({ error: 'Failed to update theatre setup' }, { status: 500 });
  }
}

// DELETE theatre setup
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN and THEATRE_MANAGER can delete
    if (!['ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    const existingSetup = await prisma.theatreSetup.findUnique({
      where: { id },
      include: {
        returns: true,
        items: true,
      },
    });

    if (!existingSetup) {
      return NextResponse.json({ error: 'Theatre setup not found' }, { status: 404 });
    }

    // Delete related records first
    await prisma.$transaction(async (tx) => {
      // Delete returns
      await tx.theatreSetupReturn.deleteMany({ where: { setupId: id } });
      
      // Delete setup items
      await tx.theatreSetupItem.deleteMany({ where: { setupId: id } });
      
      // Delete the setup
      await tx.theatreSetup.delete({ where: { id } });

      // Log the deletion
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'DELETE',
          tableName: 'theatre_setups',
          recordId: id,
          changes: JSON.stringify({ deletedSetup: existingSetup.theatreId }),
        },
      });
    });

    return NextResponse.json({ message: 'Theatre setup deleted successfully' });
  } catch (error) {
    console.error('Error deleting theatre setup:', error);
    return NextResponse.json({ error: 'Failed to delete theatre setup' }, { status: 500 });
  }
}
