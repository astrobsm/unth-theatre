import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/nurse-handover/[id] - Get single handover with full details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const handover = await prisma.nurseHandover.findUnique({
      where: { id: params.id },
      include: {
        surgery: {
          select: { id: true, procedureName: true, scheduledDate: true, status: true, surgeonName: true },
        },
        patient: {
          select: { id: true, name: true, folderNumber: true, ward: true, age: true, gender: true },
        },
        handingOverNurse: { select: { id: true, fullName: true, role: true } },
        receivingNurse: { select: { id: true, fullName: true, role: true } },
        witnessNurse: { select: { id: true, fullName: true, role: true } },
        checklistItems: { orderBy: { category: 'asc' } },
        auditTrail: { orderBy: { timestamp: 'desc' } },
      },
    });

    if (!handover) {
      return NextResponse.json({ error: 'Handover not found' }, { status: 404 });
    }

    return NextResponse.json({ handover });
  } catch (error) {
    console.error('Error fetching handover:', error);
    return NextResponse.json({ error: 'Failed to fetch handover' }, { status: 500 });
  }
}

// PATCH /api/nurse-handover/[id] - Update handover (acknowledge, complete, dispute)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, receiverNotes, issueDetails, ...updateFields } = body;

    const existing = await prisma.nurseHandover.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Handover not found' }, { status: 404 });
    }

    const updateData: any = {};
    let auditAction = 'UPDATED';

    if (action === 'acknowledge') {
      updateData.status = 'ACKNOWLEDGED';
      updateData.acknowledgedAt = new Date();
      updateData.receivingNurseId = session.user.id;
      updateData.receivingNurseName = session.user.name || 'Unknown';
      updateData.receiverNotes = receiverNotes || null;
      auditAction = 'ACKNOWLEDGED';
    } else if (action === 'complete') {
      updateData.status = 'COMPLETED';
      updateData.handoverCompletedAt = new Date();
      auditAction = 'COMPLETED';
    } else if (action === 'dispute') {
      updateData.status = 'DISPUTED';
      updateData.issuesRaised = true;
      updateData.issueDetails = issueDetails;
      updateData.receiverNotes = receiverNotes || null;
      auditAction = 'DISPUTED';
    } else if (action === 'submit') {
      updateData.status = 'PENDING_ACKNOWLEDGEMENT';
      auditAction = 'SUBMITTED';
    } else {
      // General field update
      Object.keys(updateFields).forEach(key => {
        if (updateFields[key] !== undefined) {
          updateData[key] = updateFields[key];
        }
      });
    }

    const handover = await prisma.nurseHandover.update({
      where: { id: params.id },
      data: updateData,
      include: {
        handingOverNurse: { select: { id: true, fullName: true } },
        receivingNurse: { select: { id: true, fullName: true } },
        checklistItems: true,
      },
    });

    // Audit trail
    await prisma.handoverAuditLog.create({
      data: {
        handoverId: handover.id,
        action: auditAction,
        performedById: session.user.id,
        performedByName: session.user.name || 'Unknown',
        details: JSON.stringify({ action, ...updateData }),
      },
    });

    return NextResponse.json({ handover });
  } catch (error: any) {
    console.error('Error updating handover:', error);
    return NextResponse.json({ error: error.message || 'Failed to update handover' }, { status: 500 });
  }
}
