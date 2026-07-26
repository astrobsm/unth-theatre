import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST',
];

const schema = z.object({ surgeryId: z.string(), userId: z.string() });

// POST /api/roster/anaesthetist-coverage/assign — write the matched anaesthetist
// onto a surgery (Surgery.anesthetistId).
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes((session.user as any).role)) {
      return NextResponse.json({ error: 'Not allowed to assign anaesthetists' }, { status: 403 });
    }

    const { surgeryId, userId } = schema.parse(await request.json());

    const [surgery, anaesthetist] = await Promise.all([
      prisma.surgery.findUnique({ where: { id: surgeryId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, role: true } }),
    ]);
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    if (!anaesthetist) return NextResponse.json({ error: 'Anaesthetist not found' }, { status: 404 });

    await prisma.surgery.update({ where: { id: surgeryId }, data: { anesthetistId: userId } });

    try {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          tableName: 'Surgery',
          recordId: surgeryId,
          changes: JSON.stringify({ anesthetistId: userId, anaesthetistName: anaesthetist.fullName }),
        },
      });
    } catch { /* audit is best-effort */ }

    return NextResponse.json({ ok: true, anaesthetist: { id: anaesthetist.id, name: anaesthetist.fullName } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    console.error('Assign anaesthetist failed:', error);
    return NextResponse.json({ error: 'Failed to assign anaesthetist' }, { status: 500 });
  }
}
