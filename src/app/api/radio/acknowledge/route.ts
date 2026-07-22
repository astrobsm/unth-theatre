import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ackSchema = z.object({
  announcementId: z.string().min(1),
  code: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/radio/acknowledge
// Logs that the current user has acknowledged a (typically emergency / staff
// request) announcement. Stops the looped playback by setting status.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const userName = (session.user as any).fullName || (session.user as any).name || 'Staff';
  const userRole = (session.user as any).role;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
  const { announcementId, code, notes } = parsed.data;

  try {
    const ann = await prisma.radioAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!ann) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    // Acknowledgement is one tap, no code check. In a theatre the alarm must be
    // silenceable instantly, and confirmation codes had no mechanism to reach
    // the staff who would need them — so an enforced code could only lock the
    // alarm on. `codeUsed` is still recorded below when a client sends one.

    const responseSecs = Math.max(
      0,
      Math.floor((Date.now() - ann.createdAt.getTime()) / 1000)
    );

    await prisma.radioAcknowledgment.create({
      data: {
        announcementId: ann.id,
        userId,
        userName,
        userRole,
        responseSecs,
        codeUsed: code,
        notes,
      },
    });

    await prisma.radioAnnouncement.update({
      where: { id: ann.id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
      },
    });

    return NextResponse.json({ ok: true, responseSecs });
  } catch (error) {
    console.error('Radio acknowledge error:', error);
    return NextResponse.json({ error: 'Failed to record acknowledgment' }, { status: 500 });
  }
}
