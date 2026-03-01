import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const administerSchema = z.object({
  usageRecordId: z.string(),
  quantityUsed: z.number().int().min(1),
  administeredByName: z.string(),
  notes: z.string().optional(),
});

// POST - Record medication administration during surgery
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = administerSchema.parse(body);
    const user = session.user as any;

    // Get existing usage record
    const usageRecord = await prisma.medicationUsageRecord.findUnique({
      where: { id: data.usageRecordId },
    });

    if (!usageRecord) {
      return NextResponse.json({ error: 'Usage record not found' }, { status: 404 });
    }

    const newAdministered = usageRecord.quantityAdministered + data.quantityUsed;
    const newRemaining = usageRecord.quantityDispensed - newAdministered - usageRecord.quantityWasted;

    if (newRemaining < 0) {
      return NextResponse.json({
        error: `Cannot administer ${data.quantityUsed}. Only ${usageRecord.quantityRemaining} remaining.`,
      }, { status: 400 });
    }

    // Parse existing administration log
    let adminLog: any[] = [];
    try {
      adminLog = usageRecord.administrationLog ? JSON.parse(usageRecord.administrationLog) : [];
    } catch {
      adminLog = [];
    }

    // Add new entry
    adminLog.push({
      time: new Date().toISOString(),
      amount: data.quantityUsed,
      administeredBy: data.administeredByName,
      administeredById: user.id,
      notes: data.notes || '',
    });

    // Update usage record
    const updated = await prisma.medicationUsageRecord.update({
      where: { id: data.usageRecordId },
      data: {
        quantityAdministered: newAdministered,
        quantityRemaining: newRemaining,
        administrationLog: JSON.stringify(adminLog),
        administeredById: user.id,
        administeredByName: data.administeredByName,
        isFullyUsed: newRemaining === 0,
        isReturnRequired: newRemaining > 0,
      },
    });

    // Update prescription status to IN_USE
    await prisma.anestheticPrescription.update({
      where: { id: usageRecord.prescriptionId },
      data: { status: 'IN_USE' },
    });

    return NextResponse.json({ success: true, usageRecord: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error recording administration:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Record wastage
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { usageRecordId, quantityWasted, reason } = body;

    if (!usageRecordId || !quantityWasted) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const usageRecord = await prisma.medicationUsageRecord.findUnique({
      where: { id: usageRecordId },
    });

    if (!usageRecord) {
      return NextResponse.json({ error: 'Usage record not found' }, { status: 404 });
    }

    const newWasted = usageRecord.quantityWasted + quantityWasted;
    const newRemaining = usageRecord.quantityDispensed - usageRecord.quantityAdministered - newWasted;

    if (newRemaining < 0) {
      return NextResponse.json({ error: 'Wastage exceeds remaining quantity' }, { status: 400 });
    }

    const updated = await prisma.medicationUsageRecord.update({
      where: { id: usageRecordId },
      data: {
        quantityWasted: newWasted,
        quantityRemaining: newRemaining,
        isReturnRequired: newRemaining > 0,
        isFullyUsed: newRemaining === 0,
      },
    });

    return NextResponse.json({ success: true, usageRecord: updated });
  } catch (error: any) {
    console.error('Error recording wastage:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Get usage records for a surgery/prescription
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

    const usageRecords = await prisma.medicationUsageRecord.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    // Calculate summary
    const summary = {
      totalDispensed: usageRecords.reduce((sum, r) => sum + r.quantityDispensed, 0),
      totalAdministered: usageRecords.reduce((sum, r) => sum + r.quantityAdministered, 0),
      totalWasted: usageRecords.reduce((sum, r) => sum + r.quantityWasted, 0),
      totalRemaining: usageRecords.reduce((sum, r) => sum + r.quantityRemaining, 0),
      itemsRequiringReturn: usageRecords.filter((r) => r.isReturnRequired && !r.isReturned).length,
    };

    return NextResponse.json({ usageRecords, summary });
  } catch (error: any) {
    console.error('Error fetching usage records:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
