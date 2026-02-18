import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const packPrescriptionSchema = z.object({
  packingNotes: z.string().optional(),
  pharmacistNotes: z.string().optional(),
  medicationPackingStatus: z.array(z.object({
    drugName: z.string(),
    isPacked: z.boolean(),
    isOutOfStock: z.boolean().default(false),
    substituteAvailable: z.boolean().default(false),
    substituteDrugName: z.string().optional(),
    pharmacistNote: z.string().optional(),
  })).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a pharmacist
    if (!['PHARMACIST'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only pharmacists can pack prescriptions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = packPrescriptionSchema.parse(body);

    // Check if prescription exists and is approved
    const existingPrescription = await prisma.anestheticPrescription.findUnique({
      where: { id: params.id },
    });

    if (!existingPrescription) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      );
    }

    if (existingPrescription.status !== 'APPROVED' && existingPrescription.status !== 'PARTIALLY_PACKED' && existingPrescription.status !== 'LATE_ARRIVAL') {
      return NextResponse.json(
        { error: 'Only approved or late-arrival prescriptions can be packed' },
        { status: 400 }
      );
    }

    // Determine packing status based on per-medication tracking
    const medStatuses = validatedData.medicationPackingStatus || [];
    const hasOutOfStock = medStatuses.some(m => m.isOutOfStock);
    const allPacked = medStatuses.length > 0 && medStatuses.every(m => m.isPacked || m.isOutOfStock);
    const anyPacked = medStatuses.some(m => m.isPacked);
    
    let newStatus: string;
    if (hasOutOfStock && allPacked) {
      newStatus = 'PARTIALLY_PACKED';
    } else if (allPacked) {
      newStatus = 'PACKED';
    } else if (anyPacked) {
      newStatus = 'PARTIALLY_PACKED';
    } else {
      newStatus = 'PACKED'; // Default when no per-med tracking
    }

    const outOfStockItems = medStatuses.filter(m => m.isOutOfStock).map(m => m.drugName);

    // Update prescription as packed
    const updatedPrescription = await prisma.anestheticPrescription.update({
      where: { id: params.id },
      data: {
        status: newStatus as any,
        packedById: session.user.id,
        packedByName: session.user.name,
        packedAt: new Date(),
        packingNotes: validatedData.packingNotes,
        pharmacistNotes: validatedData.pharmacistNotes,
        medicationPackingStatus: medStatuses.length > 0 ? JSON.stringify(medStatuses) : undefined,
        hasOutOfStockItems: hasOutOfStock,
        outOfStockItems: outOfStockItems.length > 0 ? JSON.stringify(outOfStockItems) : null,
        outOfStockNotifiedAt: hasOutOfStock ? new Date() : null,
      },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            surgeonId: true,
          },
        },
        patient: true,
        prescribedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        packedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'PACK_PRESCRIPTION',
        tableName: 'AnestheticPrescription',
        recordId: updatedPrescription.id,
        changes: JSON.stringify({
          packedBy: session.user.name,
          packedAt: new Date(),
          notes: validatedData.packingNotes,
          outOfStockItems,
          status: newStatus,
        }),
      },
    });

    // If there are out-of-stock items, notify the surgeon and anesthetist
    if (hasOutOfStock && updatedPrescription.surgery) {
      const notifyUserIds: string[] = [];
      
      // Notify the prescribing anesthetist
      if (updatedPrescription.prescribedBy?.id) {
        notifyUserIds.push(updatedPrescription.prescribedBy.id);
      }
      
      // Notify the approving consultant
      if (updatedPrescription.approvedBy?.id) {
        notifyUserIds.push(updatedPrescription.approvedBy.id);
      }
      
      // Notify the surgeon
      if (updatedPrescription.surgery.surgeonId) {
        notifyUserIds.push(updatedPrescription.surgery.surgeonId);
      }

      const uniqueIds = Array.from(new Set(notifyUserIds));
      const outOfStockMsg = outOfStockItems.join(', ');

      await prisma.notification.createMany({
        data: uniqueIds.map(uid => ({
          userId: uid,
          type: 'OUT_OF_STOCK_DRUGS',
          title: 'Out of Stock Medications',
          message: `The following drugs for patient ${updatedPrescription.patientName} are out of stock: ${outOfStockMsg}. Surgery: ${updatedPrescription.surgery?.procedureName || 'N/A'}`,
          link: `/dashboard/prescriptions`,
        })),
      });
    }

    // Notify surgeon that drugs have been packed
    if (newStatus === 'PACKED' && updatedPrescription.surgery?.surgeonId) {
      await prisma.notification.create({
        data: {
          userId: updatedPrescription.surgery.surgeonId,
          type: 'DRUGS_PACKED',
          title: 'Medications Packed',
          message: `All medications for patient ${updatedPrescription.patientName} have been packed and are ready for surgery: ${updatedPrescription.surgery.procedureName || 'N/A'}`,
          link: `/dashboard/prescriptions`,
        },
      });
    }

    return NextResponse.json(updatedPrescription);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error packing prescription:', error);
    return NextResponse.json(
      { error: 'Failed to pack prescription' },
      { status: 500 }
    );
  }
}
