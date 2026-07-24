import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { isAvailabilityStatus } from '@/lib/staffAvailability';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

// GET /api/staff/availability[?role=&status=&q=]
// The live workforce board — approved staff with their current availability.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const role = sp.get('role')?.trim();
  const status = sp.get('status')?.trim();
  const q = sp.get('q')?.trim();

  const where: any = { status: 'APPROVED' };
  if (role) where.role = role;
  if (status) where.availabilityStatus = status;
  if (q) where.fullName = { contains: q, mode: 'insensitive' };

  const staff = await prisma.user.findMany({
    where,
    select: {
      id: true, fullName: true, role: true, department: true, staffId: true,
      phoneNumber: true, extension: true,
      availabilityStatus: true, availabilityNote: true, currentLocation: true, availabilityUpdatedAt: true,
    },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    take: 1000,
  });

  return NextResponse.json({ staff, me: (session.user as any).id });
}

const setSchema = z.object({
  status: z.string().refine(isAvailabilityStatus, 'Invalid status'),
  note: z.string().nullish(),
  currentLocation: z.string().nullish(),
  userId: z.string().nullish(), // admins may set another user's status
});

// POST /api/staff/availability — set MY availability (or, for admins, someone else's).
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = setSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const myId = (session.user as any).id;
  const myRole = (session.user as any).role;
  const targetId = d.userId && d.userId !== myId ? d.userId : myId;
  if (targetId !== myId && !ADMIN_ROLES.includes(myRole)) {
    return NextResponse.json({ error: 'Only an admin/theatre manager can set another staff member’s status' }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: targetId },
    data: {
      availabilityStatus: d.status,
      availabilityNote: d.note ?? null,
      currentLocation: d.currentLocation ?? null,
      availabilityUpdatedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
