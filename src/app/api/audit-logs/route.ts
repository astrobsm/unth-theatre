import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('tableName') || undefined;
    const recordId = searchParams.get('recordId') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    const where: any = {};
    if (tableName) where.tableName = tableName;
    if (recordId) where.recordId = recordId;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('audit-logs GET error', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
