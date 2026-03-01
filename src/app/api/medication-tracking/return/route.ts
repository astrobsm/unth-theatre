import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const returnSchema = z.object({
  reconciliationId: z.string(),
  prescriptionId: z.string(),
  surgeryId: z.string(),
  receivedById: z.string(),
  receivedByName: z.string(),
  itemsReturned: z.array(z.object({
    drugName: z.string(),
    quantityReturned: z.number().int().min(0),
    condition: z.enum(['GOOD', 'DAMAGED', 'EXPIRED', 'CONTAMINATED']).default('GOOD'),
    pharmacistNotes: z.string().optional(),
  })),
  pharmacistNotes: z.string().optional(),
});

// POST - Record medication return to pharmacy
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = returnSchema.parse(body);
    const user = session.user as any;

    // Get reconciliation
    const reconciliation = await prisma.medicationReconciliation.findUnique({
      where: { id: data.reconciliationId },
    });

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    // Calculate discrepancy
    const usageRecords = await prisma.medicationUsageRecord.findMany({
      where: { prescriptionId: data.prescriptionId },
    });

    let hasDiscrepancy = false;
    let totalReturned = 0;

    for (const returnItem of data.itemsReturned) {
      const usageRecord = usageRecords.find((r) => r.drugName === returnItem.drugName);
      if (usageRecord) {
        if (returnItem.quantityReturned !== usageRecord.quantityRemaining) {
          hasDiscrepancy = true;
        }
        totalReturned += returnItem.quantityReturned;

        // Update usage record 
        await prisma.medicationUsageRecord.update({
          where: { id: usageRecord.id },
          data: {
            isReturned: true,
            returnedAt: new Date(),
            returnedQuantity: returnItem.quantityReturned,
          },
        });
      }
    }

    // Create return record
    const medicationReturn = await prisma.medicationReturn.create({
      data: {
        reconciliationId: data.reconciliationId,
        prescriptionId: data.prescriptionId,
        surgeryId: data.surgeryId,
        returnedById: user.id,
        returnedByName: user.fullName || user.name || 'Unknown',
        receivedById: data.receivedById,
        receivedByName: data.receivedByName,
        receivedAt: new Date(),
        itemsReturned: JSON.stringify(data.itemsReturned),
        pharmacistVerified: true,
        pharmacistNotes: data.pharmacistNotes,
        hasDiscrepancy,
        discrepancyNotes: hasDiscrepancy ? 'Quantity returned does not match expected remaining quantity' : null,
      },
    });

    // Update reconciliation
    const allReturned = usageRecords
      .filter((r) => r.isReturnRequired)
      .every((r) => {
        const returnItem = data.itemsReturned.find((ri) => ri.drugName === r.drugName);
        return returnItem && returnItem.quantityReturned >= r.quantityRemaining;
      });

    await prisma.medicationReconciliation.update({
      where: { id: data.reconciliationId },
      data: {
        totalDrugsReturned: reconciliation.totalDrugsReturned + totalReturned,
        status: allReturned ? 'FULLY_RETURNED' : 'PARTIALLY_RETURNED',
      },
    });

    // Update prescription status
    await prisma.anestheticPrescription.update({
      where: { id: data.prescriptionId },
      data: { status: 'RETURNED' },
    });

    // If there's a discrepancy, auto-generate a query
    if (hasDiscrepancy) {
      const unreturvedItems = data.itemsReturned
        .map((ri) => {
          const usageRecord = usageRecords.find((r) => r.drugName === ri.drugName);
          if (usageRecord && ri.quantityReturned < usageRecord.quantityRemaining) {
            return {
              drugName: ri.drugName,
              quantityExpected: usageRecord.quantityRemaining,
              quantityReturned: ri.quantityReturned,
              deficit: usageRecord.quantityRemaining - ri.quantityReturned,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (unreturvedItems.length > 0) {
        // Get the anaesthetist who collected the meds
        const collection = await prisma.medicationCollection.findFirst({
          where: { prescriptionId: data.prescriptionId },
          orderBy: { collectedAt: 'desc' },
        });

        const responseDeadline = new Date();
        responseDeadline.setHours(responseDeadline.getHours() + 24);

        await prisma.medicationNonReturnQuery.create({
          data: {
            reconciliationId: data.reconciliationId,
            prescriptionId: data.prescriptionId,
            surgeryId: data.surgeryId,
            queriedUserId: collection?.collectedById || user.id,
            queriedUserName: collection?.collectedByName || 'Unknown',
            issuedById: data.receivedById,
            issuedByName: data.receivedByName,
            unreturvedItems: JSON.stringify(unreturvedItems),
            responseDeadline,
            status: 'PENDING',
          },
        });

        // Update reconciliation with query info
        await prisma.medicationReconciliation.update({
          where: { id: data.reconciliationId },
          data: {
            status: 'QUERY_ISSUED',
            queryIssuedAt: new Date(),
            queryReason: `Discrepancy in returned medications: ${unreturvedItems.map(
              (i: any) => `${i.drugName} (expected: ${i.quantityExpected}, returned: ${i.quantityReturned})`
            ).join(', ')}`,
          },
        });

        // Update prescription status
        await prisma.anestheticPrescription.update({
          where: { id: data.prescriptionId },
          data: { status: 'QUERY_ISSUED' },
        });
      }
    }

    return NextResponse.json({ success: true, medicationReturn, hasDiscrepancy });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error recording return:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Fetch return records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const prescriptionId = searchParams.get('prescriptionId');
    const surgeryId = searchParams.get('surgeryId');

    const where: any = {};
    if (prescriptionId) where.prescriptionId = prescriptionId;
    if (surgeryId) where.surgeryId = surgeryId;

    const returns = await prisma.medicationReturn.findMany({
      where,
      orderBy: { returnedAt: 'desc' },
    });

    return NextResponse.json(returns);
  } catch (error: any) {
    console.error('Error fetching returns:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
