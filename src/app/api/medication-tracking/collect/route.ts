import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const collectSchema = z.object({
  prescriptionId: z.string(),
  surgeryId: z.string(),
  dispensedById: z.string(),
  dispensedByName: z.string(),
  itemsCollected: z.array(z.object({
    drugName: z.string(),
    dosage: z.string(),
    quantityDispensed: z.number().int().min(1),
  })),
  notes: z.string().optional(),
});

// POST - Record medication collection by anaesthetist
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = collectSchema.parse(body);

    // Verify prescription exists and is in PACKED/DISPENSED status
    const prescription = await prisma.anestheticPrescription.findUnique({
      where: { id: data.prescriptionId },
      include: { prescriptionItems: true },
    });

    if (!prescription) {
      return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });
    }

    if (!['PACKED', 'PARTIALLY_PACKED', 'DISPENSED'].includes(prescription.status)) {
      return NextResponse.json({ error: 'Prescription is not ready for collection' }, { status: 400 });
    }

    const user = session.user as any;

    // Create collection record
    const collection = await prisma.medicationCollection.create({
      data: {
        prescriptionId: data.prescriptionId,
        surgeryId: data.surgeryId,
        collectedById: user.id,
        collectedByName: user.fullName || user.name || 'Unknown',
        dispensedById: data.dispensedById,
        dispensedByName: data.dispensedByName,
        itemsCollected: JSON.stringify(data.itemsCollected),
        anaesthetistSignature: true,
        notes: data.notes,
      },
    });

    // Create MedicationUsageRecord for each item collected
    for (const item of data.itemsCollected) {
      await prisma.medicationUsageRecord.create({
        data: {
          prescriptionId: data.prescriptionId,
          surgeryId: data.surgeryId,
          drugName: item.drugName,
          dosage: item.dosage,
          route: prescription.prescriptionItems.find(
            (pi) => pi.drugName === item.drugName
          )?.route || 'IV',
          quantityDispensed: item.quantityDispensed,
          quantityRemaining: item.quantityDispensed,
          isReturnRequired: true,
        },
      });
    }

    // Update prescription status to COLLECTED
    await prisma.anestheticPrescription.update({
      where: { id: data.prescriptionId },
      data: { status: 'COLLECTED' },
    });

    return NextResponse.json({ success: true, collection });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error recording collection:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Get collection records
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

    const collections = await prisma.medicationCollection.findMany({
      where,
      orderBy: { collectedAt: 'desc' },
    });

    return NextResponse.json(collections);
  } catch (error: any) {
    console.error('Error fetching collections:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
