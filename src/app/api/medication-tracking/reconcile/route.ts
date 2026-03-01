import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const reconcileSchema = z.object({
  prescriptionId: z.string(),
  surgeryId: z.string(),
  notes: z.string().optional(),
});

// POST - Create reconciliation at end of surgery
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = reconcileSchema.parse(body);
    const user = session.user as any;

    // Check if reconciliation already exists
    const existing = await prisma.medicationReconciliation.findUnique({
      where: { prescriptionId: data.prescriptionId },
    });

    if (existing) {
      return NextResponse.json({ error: 'Reconciliation already exists for this prescription' }, { status: 400 });
    }

    // Get all usage records for this prescription
    const usageRecords = await prisma.medicationUsageRecord.findMany({
      where: { prescriptionId: data.prescriptionId },
    });

    if (usageRecords.length === 0) {
      return NextResponse.json({ error: 'No medication usage records found for this prescription' }, { status: 400 });
    }

    // Build reconciliation items
    const reconciliationItems = usageRecords.map((r: any) => ({
      drugName: r.drugName,
      dosage: r.dosage,
      route: r.route,
      dispensed: r.quantityDispensed,
      used: r.quantityAdministered,
      wasted: r.quantityWasted,
      remaining: r.quantityRemaining,
      returned: 0,
      status: r.quantityRemaining > 0 ? 'PENDING_RETURN' : 'FULLY_USED',
    }));

    const totalDispensed = usageRecords.reduce((sum: number, r: any) => sum + r.quantityDispensed, 0);
    const totalUsed = usageRecords.reduce((sum: number, r: any) => sum + r.quantityAdministered, 0);
    const totalToReturn = usageRecords.reduce((sum: number, r: any) => sum + r.quantityRemaining, 0);
    const totalWasted = usageRecords.reduce((sum: number, r: any) => sum + r.quantityWasted, 0);

    // Set return deadline: 2 hours after reconciliation
    const returnDeadline = new Date();
    returnDeadline.setHours(returnDeadline.getHours() + 2);

    // Create reconciliation
    const reconciliation = await prisma.medicationReconciliation.create({
      data: {
        prescriptionId: data.prescriptionId,
        surgeryId: data.surgeryId,
        reconciledById: user.id,
        reconciledByName: user.fullName || user.name || 'Unknown',
        totalDrugsDispensed: totalDispensed,
        totalDrugsUsed: totalUsed,
        totalDrugsToReturn: totalToReturn,
        totalDrugsWasted: totalWasted,
        reconciliationItems: JSON.stringify(reconciliationItems),
        status: totalToReturn > 0 ? 'PENDING_RETURN' : 'CLOSED',
        returnDeadline: totalToReturn > 0 ? returnDeadline : null,
        notes: data.notes,
      },
    });

    // Update prescription status
    await prisma.anestheticPrescription.update({
      where: { id: data.prescriptionId },
      data: { status: 'RECONCILED' },
    });

    return NextResponse.json({ success: true, reconciliation });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating reconciliation:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Fetch reconciliations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const prescriptionId = searchParams.get('prescriptionId');
    const surgeryId = searchParams.get('surgeryId');
    const status = searchParams.get('status');
    const pendingReturns = searchParams.get('pendingReturns');

    const where: any = {};
    if (prescriptionId) where.prescriptionId = prescriptionId;
    if (surgeryId) where.surgeryId = surgeryId;
    if (status) where.status = status;
    if (pendingReturns === 'true') {
      where.status = { in: ['PENDING_RETURN', 'PARTIALLY_RETURNED'] };
    }

    const reconciliations = await prisma.medicationReconciliation.findMany({
      where,
      include: {
        prescription: {
          select: {
            patientName: true,
            surgeryId: true,
            prescribedByName: true,
          },
        },
        surgery: {
          select: {
            procedureName: true,
            scheduledDate: true,
          },
        },
      },
      orderBy: { reconciledAt: 'desc' },
    });

    return NextResponse.json(reconciliations);
  } catch (error: any) {
    console.error('Error fetching reconciliations:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
