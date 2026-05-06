import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  theatreId: z.string().min(1),
  theatreName: z.string().min(1),
  notes: z.string().optional(),
});

const unitSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  subspecialty: z.string().min(1, 'Subspecialty is required'),
  location: z.string().min(1, 'Location is required'),
  active: z.boolean().optional(),
  notes: z.string().optional(),
  schedules: z.array(scheduleSchema).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');
    const subspecialty = searchParams.get('subspecialty');
    const dayOfWeek = searchParams.get('dayOfWeek');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const where: any = {};
    if (location) where.location = location;
    if (subspecialty) where.subspecialty = subspecialty;
    if (activeOnly) where.active = true;

    const units = await prisma.surgicalUnit.findMany({
      where,
      include: {
        schedules: dayOfWeek
          ? { where: { dayOfWeek: parseInt(dayOfWeek, 10) }, orderBy: { dayOfWeek: 'asc' } }
          : { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: [{ subspecialty: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error('Error fetching surgical units:', error);
    return NextResponse.json({ error: 'Failed to fetch surgical units' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ADMIN_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = unitSchema.parse(body);
    const { schedules, ...unitData } = data;

    const created = await prisma.surgicalUnit.create({
      data: {
        ...unitData,
        active: unitData.active ?? true,
        schedules: schedules && schedules.length > 0
          ? { create: schedules.map((s) => ({ ...s })) }
          : undefined,
      },
      include: { schedules: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'surgical_units',
        recordId: created.id,
        changes: JSON.stringify(created),
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Error creating surgical unit:', error);
    return NextResponse.json({ error: 'Failed to create surgical unit' }, { status: 500 });
  }
}
