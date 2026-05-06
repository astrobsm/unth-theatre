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

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  subspecialty: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  // If provided, schedules ARRAY fully replaces existing schedules for this unit.
  schedules: z.array(scheduleSchema).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const unit = await prisma.surgicalUnit.findUnique({
    where: { id: params.id },
    include: { schedules: { orderBy: { dayOfWeek: 'asc' } } },
  });
  if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(unit);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ADMIN_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);
    const { schedules, ...rest } = data;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.surgicalUnit.update({
        where: { id: params.id },
        data: rest,
      });
      if (schedules) {
        await tx.surgicalUnitSchedule.deleteMany({ where: { unitId: params.id } });
        for (const s of schedules) {
          await tx.surgicalUnitSchedule.create({
            data: { unitId: params.id, ...s },
          });
        }
      }
      return tx.surgicalUnit.findUnique({
        where: { id: params.id },
        include: { schedules: { orderBy: { dayOfWeek: 'asc' } } },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'surgical_units',
        recordId: params.id,
        changes: JSON.stringify(body),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Error updating surgical unit:', error);
    return NextResponse.json({ error: 'Failed to update surgical unit' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ADMIN_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.surgicalUnit.delete({ where: { id: params.id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'surgical_units',
        recordId: params.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting surgical unit:', error);
    return NextResponse.json({ error: 'Failed to delete surgical unit' }, { status: 500 });
  }
}
