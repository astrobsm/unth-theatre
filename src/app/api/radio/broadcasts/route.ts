import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

const broadcastSchema = z.object({
  title: z.string().min(2),
  category: z.enum(['WELCOME', 'RULES', 'MUSIC', 'ANNOUNCEMENT', 'CUSTOM']),
  message: z.string().optional(),
  audioUrl: z.string().optional(),
  voice: z.string().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  daysOfWeek: z.string().optional(), // CSV
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  intervalMins: z.number().int().min(5).max(720).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await prisma.radioBroadcast.findMany({
    orderBy: [{ active: 'desc' }, { timeOfDay: 'asc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = broadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }
  const d = parsed.data;
  if (!d.message && !d.audioUrl) {
    return NextResponse.json(
      { error: 'Either message or audioUrl is required' },
      { status: 400 }
    );
  }

  const created = await prisma.radioBroadcast.create({
    data: {
      title: d.title,
      category: d.category,
      message: d.message,
      audioUrl: d.audioUrl,
      voice: d.voice,
      priority: d.priority ?? 50,
      daysOfWeek: d.daysOfWeek ?? '0,1,2,3,4,5,6',
      timeOfDay: d.timeOfDay,
      intervalMins: d.intervalMins,
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
      active: d.active ?? true,
      createdById: (session.user as any).id,
    },
  });
  return NextResponse.json({ broadcast: created });
}
