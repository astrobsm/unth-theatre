import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import {
  FIELD_NAMES,
  bloodPressureIncomplete,
  parsePreopData,
} from '@/lib/preopData';

export const dynamic = 'force-dynamic';

/**
 * The compulsory pre-operative clinical values, readable and writable after
 * booking — because the FBC and U&E usually are not back when the case is
 * booked, and the safety check flags their absence until somebody records
 * them. See lib/preopData.ts.
 */

const SELECT = Object.fromEntries(FIELD_NAMES.map((f) => [f, true])) as Record<string, true>;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const surgery = await prisma.surgery.findUnique({
    where: { id: params.id },
    select: {
      id: true, procedureName: true, surgeryType: true, scheduledDate: true, scheduledTime: true,
      patient: { select: { name: true, folderNumber: true, age: true, ageUnit: true, gender: true } },
      ...SELECT,
    },
  });
  if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

  return NextResponse.json(surgery);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Only the fields in the shared definition are ever written. Anything else in
  // the payload is discarded, so this route cannot be used to set arbitrary
  // columns on a surgery.
  const { data, errors } = parsePreopData(body);

  if (bloodPressureIncomplete(data)) {
    errors.push('Blood pressure needs both systolic and diastolic, or neither.');
  }
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const existing = await prisma.surgery.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

  const updated = await prisma.surgery.update({
    where: { id: params.id },
    data,
    select: SELECT,
  });

  // Clinical values changing after booking is exactly the kind of thing an
  // audit needs to be able to reconstruct: who entered the haemoglobin that
  // let the case proceed, and when.
  try {
    const who = session.user as { id?: string; name?: string };
    if (who.id) {
      await prisma.auditLog.create({
        data: {
          userId: who.id,
          action: 'PREOP_DATA_UPDATE',
          tableName: 'surgeries',
          recordId: params.id,
          changes: JSON.stringify(data),
        },
      });
    }
  } catch {
    // An audit failure must not lose the clinical value the user just entered.
  }

  return NextResponse.json({ ok: true, surgery: updated });
}
