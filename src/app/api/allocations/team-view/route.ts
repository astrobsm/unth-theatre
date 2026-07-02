import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/allocations/team-view?unit=<surgicalUnit>&date=<yyyy-mm-dd>
// Returns the theatre allocations (and the assigned care team) for a given
// surgical unit on a given day so a surgeon can see which theatre,
// anaesthetist, anaesthetic technician and scrub nurse are assigned.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit')?.trim();
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'A date is required' }, { status: 400 });
    }

    const dayStart = new Date(`${date}T00:00:00.000`);
    if (Number.isNaN(dayStart.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const where: any = {
      date: { gte: dayStart, lt: dayEnd },
    };
    if (unit) {
      where.surgicalUnit = { equals: unit, mode: 'insensitive' };
    }

    const staffSelect = { select: { id: true, fullName: true, role: true } };

    const allocations = await prisma.theatreAllocation.findMany({
      where,
      include: {
        theatre: { select: { id: true, name: true, location: true } },
        scrubNurse: staffSelect,
        circulatingNurse: staffSelect,
        anaestheticTechnician: staffSelect,
        anaesthetistConsultant: staffSelect,
        anaesthetistSeniorRegistrar: staffSelect,
        anaesthetistRegistrar: staffSelect,
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const result = allocations.map((a) => {
      const anaesthetists = [
        a.anaesthetistConsultant && { ...a.anaesthetistConsultant, tier: 'Consultant' },
        a.anaesthetistSeniorRegistrar && { ...a.anaesthetistSeniorRegistrar, tier: 'Senior Registrar' },
        a.anaesthetistRegistrar && { ...a.anaesthetistRegistrar, tier: 'Registrar' },
      ].filter(Boolean) as Array<{ id: string; fullName: string; role: string; tier: string }>;

      return {
        id: a.id,
        theatre: a.theatre?.name || 'Unassigned',
        theatreLocation: a.theatre?.location || null,
        surgicalUnit: a.surgicalUnit || null,
        surgeryType: a.surgeryType || null,
        shift: a.shift || null,
        startTime: a.startTime,
        endTime: a.endTime,
        anaesthetists,
        anaestheticTechnician: a.anaestheticTechnician?.fullName || null,
        scrubNurse: a.scrubNurse?.fullName || null,
        circulatingNurse: a.circulatingNurse?.fullName || null,
        notes: a.notes || null,
      };
    });

    return NextResponse.json({ date, unit: unit || null, count: result.length, allocations: result });
  } catch (error) {
    console.error('Team-view allocation error:', error);
    return NextResponse.json({ error: 'Failed to load theatre team' }, { status: 500 });
  }
}
