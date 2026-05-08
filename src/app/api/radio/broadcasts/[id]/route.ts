import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

const patchSchema = z.object({
  title: z.string().optional(),
  category: z.enum(['WELCOME', 'RULES', 'MUSIC', 'ANNOUNCEMENT', 'CUSTOM']).optional(),
  message: z.string().nullable().optional(),
  audioUrl: z.string().nullable().optional(),
  voice: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  daysOfWeek: z.string().optional(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  intervalMins: z.number().int().min(0).max(720).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  const d: any = { ...parsed.data };
  if (d.startDate) d.startDate = new Date(d.startDate);
  if (d.endDate) d.endDate = new Date(d.endDate);
  if (d.intervalMins === 0) d.intervalMins = null;

  const updated = await prisma.radioBroadcast.update({
    where: { id: params.id },
    data: d,
  });
  return NextResponse.json({ broadcast: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.radioBroadcast.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
