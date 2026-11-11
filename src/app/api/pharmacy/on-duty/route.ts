import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { watToday } from '@/lib/watDay';
import {
  resolvePharmacistOnDuty,
  matchesStandingName,
  shiftForDay,
  STANDING_PHARMACY_CONTACT_NAME,
  STANDING_PHARMACY_CONTACT_PHONE,
  type PharmacistLike,
} from '@/lib/roster/pharmacistOnDuty';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pharmacy/on-duty?date=YYYY-MM-DD
 *
 * Who theatre rings for drugs on that day. The chain (rostered -> by role ->
 * standing contact -> nobody) lives in lib/roster/pharmacistOnDuty so it can
 * be tested without a database; this route only fetches what the chain needs.
 *
 * The SHIFT is derived here, from the hospital's clock, and only for today —
 * see shiftForDay. For any other day every shift is returned, because a day
 * that is not today has no "now" to narrow it by.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const day = request.nextUrl.searchParams.get('date')?.trim() || watToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const shift = shiftForDay(day);

    // PUBLISHED only. A DRAFT roster is somebody's working copy; naming a
    // pharmacist off one would send theatre to a person who has not been told
    // they are on. pendingRemoval rows stay live until the next publish, which
    // is the behaviour every other on-duty consumer already relies on.
    const rosterRows = await prisma.roster.findMany({
      where: {
        staffCategory: 'PHARMACISTS' as never,
        date: new Date(`${day}T00:00:00.000Z`),
        status: 'PUBLISHED',
        ...(shift ? { shift: shift as never } : {}),
      },
      select: {
        id: true, staffName: true, shift: true, notes: true,
        user: { select: { id: true, fullName: true, phoneNumber: true, extension: true, role: true } },
      },
      orderBy: { staffName: 'asc' },
    });

    const rostered: PharmacistLike[] = rosterRows.map((r) => ({
      userId: r.user?.id ?? r.id,
      name: r.user?.fullName || r.staffName,
      phoneNumber: r.user?.phoneNumber ?? null,
      extension: r.user?.extension ?? null,
      role: r.user?.role ?? null,
      shift: r.shift,
    }));

    // Only fetched when they might be needed. On an ordinary day the roster
    // answers and neither of these queries runs.
    let roleHolders: PharmacistLike[] = [];
    let standingMatches: PharmacistLike[] = [];

    if (rostered.length === 0) {
      const holders = await prisma.user.findMany({
        where: { role: 'PHARMACIST' as never, status: 'APPROVED' as never },
        select: { id: true, fullName: true, phoneNumber: true, extension: true, role: true },
        orderBy: { fullName: 'asc' },
      });
      roleHolders = holders.map((u) => ({
        userId: u.id, name: u.fullName, phoneNumber: u.phoneNumber,
        extension: u.extension ?? null, role: u.role,
      }));

      if (roleHolders.every((p) => !(p.phoneNumber || '').trim())) {
        const named = await prisma.user.findMany({
          where: {
            status: 'APPROVED' as never,
            fullName: { contains: STANDING_PHARMACY_CONTACT_NAME, mode: 'insensitive' },
          },
          select: { id: true, fullName: true, phoneNumber: true, extension: true, role: true },
          orderBy: { fullName: 'asc' },
          take: 25,
        });
        // `contains` is a substring match and will pick up a name that merely
        // has the letters in it; the word-level check narrows that.
        standingMatches = named
          .filter((u) => matchesStandingName(u.fullName, STANDING_PHARMACY_CONTACT_NAME))
          .map((u) => ({
            userId: u.id, name: u.fullName, phoneNumber: u.phoneNumber,
            extension: u.extension ?? null, role: u.role,
          }));
      }
    }

    const decision = resolvePharmacistOnDuty({
      rostered,
      roleHolders,
      standingMatches,
      configuredPhone: STANDING_PHARMACY_CONTACT_PHONE,
    });

    return NextResponse.json({
      date: day,
      shift,
      isToday: day === watToday(),
      ...decision,
    });
  } catch (error) {
    console.error('[/api/pharmacy/on-duty] error:', error);
    return NextResponse.json({ error: 'Failed to resolve the pharmacist on duty.' }, { status: 500 });
  }
}
