import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Fetch disciplinary queries
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const unit = searchParams.get('unit');
    const recipientId = searchParams.get('recipientId');
    const queryType = searchParams.get('queryType');

    const where: any = {};

    // Non-admins can only see their own queries
    const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'THEATRE_MANAGER'];
    if (!adminRoles.includes(session.user.role)) {
      where.recipientId = session.user.id;
    } else if (recipientId) {
      where.recipientId = recipientId;
    }

    if (status) where.status = status;
    if (unit) where.recipientUnit = unit;
    if (queryType) where.queryType = queryType;

    const queries = await prisma.disciplinaryQuery.findMany({
      where,
      include: {
        recipient: {
          select: { id: true, fullName: true, role: true, phoneNumber: true },
        },
        issuedBy: {
          select: { id: true, fullName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(queries);
  } catch (error) {
    console.error('Error fetching disciplinary queries:', error);
    return NextResponse.json([]);
  }
}

// POST - Respond to a query (by the recipient)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { queryId, response, action } = body;

    if (!queryId) {
      return NextResponse.json({ error: 'Query ID required' }, { status: 400 });
    }

    const query = await prisma.disciplinaryQuery.findUnique({ where: { id: queryId } });
    if (!query) {
      return NextResponse.json({ error: 'Query not found' }, { status: 404 });
    }

    // Recipient responding
    if (action === 'respond') {
      if (query.recipientId !== session.user.id) {
        return NextResponse.json({ error: 'Only the recipient can respond' }, { status: 403 });
      }
      const updated = await prisma.disciplinaryQuery.update({
        where: { id: queryId },
        data: {
          recipientResponse: response,
          respondedAt: new Date(),
          status: 'RESPONDED',
        },
      });
      return NextResponse.json(updated);
    }

    // Admin resolving
    if (action === 'resolve') {
      const adminRoles = ['ADMIN', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];
      if (!adminRoles.includes(session.user.role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      const updated = await prisma.disciplinaryQuery.update({
        where: { id: queryId },
        data: {
          resolution: response,
          resolvedAt: new Date(),
          status: 'RESOLVED',
        },
      });
      return NextResponse.json(updated);
    }

    // Admin escalating
    if (action === 'escalate') {
      const updated = await prisma.disciplinaryQuery.update({
        where: { id: queryId },
        data: {
          escalatedTo: 'CHIEF_MEDICAL_DIRECTOR',
          escalatedAt: new Date(),
          escalationReason: response || 'Non-response to initial query',
          status: 'ESCALATED',
        },
      });
      return NextResponse.json(updated);
    }

    // Admin dismissing
    if (action === 'dismiss') {
      const updated = await prisma.disciplinaryQuery.update({
        where: { id: queryId },
        data: {
          resolution: response || 'Query dismissed',
          resolvedAt: new Date(),
          status: 'DISMISSED',
        },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing disciplinary query:', error);
    return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
  }
}
