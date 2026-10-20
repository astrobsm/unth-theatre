// ============================================================
// The theatre radio's volume, set from anywhere
// ------------------------------------------------------------
// GET is open to any signed-in user: the radio player itself reads it, and
// every member of theatre staff is entitled to know how loud the thing they
// are relying on is set.
//
// PUT is restricted. Turning the radio down is a decision with a
// consequence somebody else bears — the person setting it is not in the
// room and cannot hear the result — so it is limited to the people who
// answer for the theatre, and every change is attributed.
//
// The emergency floor is NOT settable here. It lives in lib/radio/volume
// where whoever is holding the slider cannot reach it.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { clampVolume, describeVolume, EMERGENCY_FLOOR } from '@/lib/radio/volume';

export const dynamic = 'force-dynamic';

/** Who may change how loud the theatre is. */
const MAY_SET = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
];

const SINGLETON = 'singleton';

/** The row, created on first read so a fresh install is never missing it. */
async function current() {
  return prisma.radioSetting.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON },
    update: {},
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const s = await current();
    return NextResponse.json({
      volume: s.volume,
      routineMuted: s.routineMuted,
      emergencyFloor: EMERGENCY_FLOOR,
      describe: describeVolume(s),
      updatedAt: s.updatedAt,
      updatedByName: s.updatedByName,
      note: s.note,
      canSet: MAY_SET.includes((session.user.role ?? '').toUpperCase()),
    });
  } catch (error) {
    console.error('radio volume read failed:', error);
    // Deliberately not a 500 with no body: the player calls this, and a
    // failure here must leave it playing at full volume rather than guessing.
    return NextResponse.json(
      { volume: 1, routineMuted: false, emergencyFloor: EMERGENCY_FLOOR, canSet: false },
      { status: 200 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_SET.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json(
      { error: 'Changing the theatre radio volume is done by theatre management.' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  // Only clamp what was actually sent, so a request changing the mute alone
  // does not reset the volume to the default on its way through.
  const data: Record<string, unknown> = {
    updatedById: session.user.id,
    updatedByName: session.user.name || 'Unknown',
  };
  if ('volume' in body) data.volume = clampVolume(body.volume);
  if ('routineMuted' in body) data.routineMuted = Boolean(body.routineMuted);
  if ('note' in body) data.note = typeof body.note === 'string' ? body.note.trim() || null : null;

  try {
    const s = await prisma.radioSetting.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...data },
      update: data,
    });

    return NextResponse.json({
      ok: true,
      volume: s.volume,
      routineMuted: s.routineMuted,
      emergencyFloor: EMERGENCY_FLOOR,
      describe: describeVolume(s),
      // Said back deliberately. Somebody who has just dragged a slider to
      // zero from home should be told, in the response, that emergencies
      // still sound — rather than discovering it either way by accident.
      note: 'Every open radio window applies this within one poll, about 15 seconds.',
      updatedAt: s.updatedAt,
      updatedByName: s.updatedByName,
    });
  } catch (error) {
    console.error('radio volume write failed:', error);
    return NextResponse.json({ error: 'The volume could not be changed' }, { status: 500 });
  }
}
