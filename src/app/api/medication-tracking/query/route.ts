import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const respondSchema = z.object({
  queryId: z.string(),
  responseText: z.string(),
});

const resolveSchema = z.object({
  queryId: z.string(),
  resolution: z.enum(['RETURNED', 'JUSTIFIED_USAGE', 'ESCALATED', 'WRITTEN_OFF']),
  resolverNotes: z.string().optional(),
});

// POST - Issue a new query for non-returned medications
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { reconciliationId, prescriptionId, surgeryId, queriedUserId, queriedUserName, unreturvedItems } = body;
    const user = session.user as any;

    if (!reconciliationId || !prescriptionId || !surgeryId || !queriedUserId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + 24);

    const query = await prisma.medicationNonReturnQuery.create({
      data: {
        reconciliationId,
        prescriptionId,
        surgeryId,
        queriedUserId,
        queriedUserName: queriedUserName || 'Unknown',
        issuedById: user.id,
        issuedByName: user.fullName || user.name || 'Unknown',
        unreturvedItems: typeof unreturvedItems === 'string' ? unreturvedItems : JSON.stringify(unreturvedItems),
        responseDeadline,
        status: 'PENDING',
      },
    });

    // Create notification for the queried user
    await prisma.notification.create({
      data: {
        userId: queriedUserId,
        type: 'ALERT',
        title: '⚠️ Medication Non-Return Query',
        message: `You have a medication non-return query. Please provide an explanation for unreturned medications within 24 hours. Query ID: ${query.id}`,
        link: '/dashboard/medication-tracking?tab=queries',
      },
    });

    // Update prescription status
    await prisma.anestheticPrescription.update({
      where: { id: prescriptionId },
      data: { status: 'QUERY_ISSUED' },
    });

    return NextResponse.json({ success: true, query });
  } catch (error: any) {
    console.error('Error creating query:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Respond to or resolve a query
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    const user = session.user as any;

    if (action === 'RESPOND') {
      const data = respondSchema.parse(body);

      const query = await prisma.medicationNonReturnQuery.findUnique({
        where: { id: data.queryId },
      });

      if (!query) {
        return NextResponse.json({ error: 'Query not found' }, { status: 404 });
      }

      const updated = await prisma.medicationNonReturnQuery.update({
        where: { id: data.queryId },
        data: {
          responseText: data.responseText,
          respondedAt: new Date(),
          status: 'RESPONDED',
        },
      });

      return NextResponse.json({ success: true, query: updated });
    }

    if (action === 'RESOLVE') {
      const data = resolveSchema.parse(body);

      const query = await prisma.medicationNonReturnQuery.findUnique({
        where: { id: data.queryId },
      });

      if (!query) {
        return NextResponse.json({ error: 'Query not found' }, { status: 404 });
      }

      const updated = await prisma.medicationNonReturnQuery.update({
        where: { id: data.queryId },
        data: {
          resolvedById: user.id,
          resolvedByName: user.fullName || user.name || 'Unknown',
          resolvedAt: new Date(),
          resolution: data.resolution,
          status: 'RESOLVED',
        },
      });

      // Update reconciliation status
      await prisma.medicationReconciliation.update({
        where: { id: query.reconciliationId },
        data: {
          status: 'QUERY_RESOLVED',
          queryResolvedAt: new Date(),
          queryResolution: data.resolution,
        },
      });

      return NextResponse.json({ success: true, query: updated });
    }

    if (action === 'ESCALATE') {
      const { queryId, escalatedTo } = body;

      const updated = await prisma.medicationNonReturnQuery.update({
        where: { id: queryId },
        data: {
          isEscalated: true,
          escalatedTo: escalatedTo || 'HOD',
          escalatedAt: new Date(),
          status: 'ESCALATED',
        },
      });

      return NextResponse.json({ success: true, query: updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error updating query:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Fetch non-return queries
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const prescriptionId = searchParams.get('prescriptionId');
    const surgeryId = searchParams.get('surgeryId');
    const queriedUserId = searchParams.get('queriedUserId');
    const status = searchParams.get('status');
    const pending = searchParams.get('pending');

    const where: any = {};
    if (prescriptionId) where.prescriptionId = prescriptionId;
    if (surgeryId) where.surgeryId = surgeryId;
    if (queriedUserId) where.queriedUserId = queriedUserId;
    if (status) where.status = status;
    if (pending === 'true') {
      where.status = { in: ['PENDING', 'RESPONDED', 'UNDER_REVIEW'] };
    }

    const queries = await prisma.medicationNonReturnQuery.findMany({
      where,
      include: {
        prescription: {
          select: { patientName: true, prescribedByName: true },
        },
        surgery: {
          select: { procedureName: true, scheduledDate: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });

    return NextResponse.json(queries);
  } catch (error: any) {
    console.error('Error fetching queries:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
