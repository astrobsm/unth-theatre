import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// PATCH: holding-area nurse transcribes the handwritten ward escort log
// Body:
//   {
//     theatrePorterArrivedAtWardTime?: ISOString | null,
//     theatrePorterDepartedWardTime?:  ISOString | null,
//     wardNurseName?: string | null,
//     wardNurseSignaturePresent?: boolean,
//     wardEntriesNotes?: string | null,
//   }
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const callUpId = params.id;
    if (!callUpId) {
      return NextResponse.json({ error: 'Call-up id is required' }, { status: 400 });
    }

    const body = await request.json();

    // Parse + validate the two times (accept ISO string, "HH:mm", or null)
    const parseTime = (raw: unknown): Date | null | undefined => {
      if (raw === undefined) return undefined;       // not provided -> leave unchanged
      if (raw === null || raw === '') return null;   // explicit clear
      if (typeof raw !== 'string') return undefined;

      // Plain "HH:mm" -> bind to today
      const hhmm = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
      if (hhmm) {
        const d = new Date();
        d.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0);
        return d;
      }
      const d = new Date(raw);
      return isNaN(d.getTime()) ? undefined : d;
    };

    const arrived  = parseTime(body.theatrePorterArrivedAtWardTime);
    const departed = parseTime(body.theatrePorterDepartedWardTime);

    if (arrived && departed && departed < arrived) {
      return NextResponse.json(
        { error: 'Departure time cannot be before arrival time' },
        { status: 400 }
      );
    }

    const existing = await prisma.patientCallUp.findUnique({ where: { id: callUpId } });
    if (!existing) {
      return NextResponse.json({ error: 'Call-up not found' }, { status: 404 });
    }

    const data: any = {
      wardEntriesRecordedById:   session.user.id,
      wardEntriesRecordedByName: session.user.name || 'Unknown',
      wardEntriesRecordedAt:     new Date(),
    };
    if (arrived !== undefined)  data.theatrePorterArrivedAtWardTime = arrived;
    if (departed !== undefined) data.theatrePorterDepartedWardTime  = departed;
    if (body.wardNurseName !== undefined) {
      data.wardNurseName = body.wardNurseName ? String(body.wardNurseName).trim() : null;
    }
    if (body.wardNurseSignaturePresent !== undefined) {
      data.wardNurseSignaturePresent = Boolean(body.wardNurseSignaturePresent);
    }
    if (body.wardEntriesNotes !== undefined) {
      data.wardEntriesNotes = body.wardEntriesNotes ? String(body.wardEntriesNotes).trim() : null;
    }

    const updated = await prisma.patientCallUp.update({
      where: { id: callUpId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Ward entries PATCH error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: fetch a single call-up with its ward entries (for the transcription form)
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const callUp = await prisma.patientCallUp.findUnique({
      where: { id: params.id },
    });
    if (!callUp) {
      return NextResponse.json({ error: 'Call-up not found' }, { status: 404 });
    }
    return NextResponse.json(callUp);
  } catch (error: any) {
    console.error('Ward entries GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
