import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      setupId,
      spiritReturned,
      savlonReturned,
      povidoneReturned,
      faceMaskReturned,
      nursesCapReturned,
      cssdGauzeReturned,
      cssdCottonReturned,
      surgicalBladesReturned,
      suctionTubbingsReturned,
      disposablesReturned,
      returnReason,
      notes,
    } = body;

    if (!setupId || !returnReason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create return record and update setup status
    const result = await prisma.$transaction(async (tx) => {
      const returnRecord = await tx.theatreSetupReturn.create({
        data: {
          setupId,
          returnedBy: session.user.id,
          spiritReturned: spiritReturned || 0,
          savlonReturned: savlonReturned || 0,
          povidoneReturned: povidoneReturned || 0,
          faceMaskReturned: faceMaskReturned || 0,
          nursesCapReturned: nursesCapReturned || 0,
          cssdGauzeReturned: cssdGauzeReturned || 0,
          cssdCottonReturned: cssdCottonReturned || 0,
          surgicalBladesReturned: surgicalBladesReturned || 0,
          suctionTubbingsReturned: suctionTubbingsReturned || 0,
          disposablesReturned: disposablesReturned || 0,
          returnReason,
          notes,
        },
      });

      // Update setup status
      await tx.theatreSetup.update({
        where: { id: setupId },
        data: { status: 'RETURNED' },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'RETURN_THEATRE_MATERIALS',
          tableName: 'THEATRE_SETUP_RETURN',
          recordId: returnRecord.id,
          changes: JSON.stringify({
            setupId,
            returnReason,
            totalReturned:
              (spiritReturned || 0) +
              (savlonReturned || 0) +
              (povidoneReturned || 0) +
              (faceMaskReturned || 0) +
              (nursesCapReturned || 0) +
              (cssdGauzeReturned || 0) +
              (cssdCottonReturned || 0) +
              (surgicalBladesReturned || 0) +
              (suctionTubbingsReturned || 0) +
              (disposablesReturned || 0),
          }),
        },
      });

      return returnRecord;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to create return:', error);
    return NextResponse.json({ error: 'Failed to create return' }, { status: 500 });
  }
}
