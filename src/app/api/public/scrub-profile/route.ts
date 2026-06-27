import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Public, no-auth scrub/footwear sizing profile.
 *
 * GET  ?staffCode=XXX  -> resolve a staff member's scrub size, footwear size
 *                          and role-based scrub colour so a scrub-care provider
 *                          can pick up the right set at the daily counter.
 * POST { staffCode, scrubSize, footwearSize, notes? }
 *                       -> staff self-register / update their own sizes without
 *                          needing to log in.
 *
 * Intentionally open (mirrors /api/public/surgical-catalog) so theatre staff
 * can record sizes from any device.
 */

// Default scrub colour for a staff role. Surgeons -> green, anaesthetists ->
// blue, nurses -> maroon, technicians -> teal, support -> grey, else black.
function colorForRole(role?: string | null): string {
  switch (role) {
    case 'SURGEON':
      return 'GREEN';
    case 'ANAESTHETIST':
    case 'CONSULTANT_ANAESTHETIST':
      return 'BLUE';
    case 'SCRUB_NURSE':
    case 'RECOVERY_ROOM_NURSE':
      return 'MAROON';
    case 'ANAESTHETIC_TECHNICIAN':
      return 'TEAL';
    case 'PORTER':
    case 'CLEANER':
      return 'GREY';
    default:
      return 'BLACK';
  }
}

const SCRUB_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export async function GET(request: NextRequest) {
  try {
    const staffCode = (
      request.nextUrl.searchParams.get('staffCode') || ''
    )
      .trim()
      .toUpperCase();

    if (!staffCode) {
      return NextResponse.json(
        { error: 'staffCode is required' },
        { status: 400 },
      );
    }

    const profile = await prisma.staffScrubProfile.findUnique({
      where: { staffCode },
    });

    // Always resolve the user (so role/colour stay accurate even before a
    // profile exists, and we can surface the staff name on pickup).
    const user = await prisma.user.findFirst({
      where: { staffCode },
      select: { fullName: true, role: true },
    });

    if (!profile && !user) {
      return NextResponse.json(
        { found: false, error: 'No staff or profile found for that code' },
        { status: 404 },
      );
    }

    const role = profile?.role || user?.role || null;

    return NextResponse.json({
      found: true,
      staffCode,
      fullName: profile?.fullName || user?.fullName || null,
      role,
      scrubColor: colorForRole(role),
      scrubSize: profile?.scrubSize || null,
      footwearSize: profile?.footwearSize || null,
      hasProfile: !!profile,
      notes: profile?.notes || null,
    });
  } catch (err) {
    console.error('GET /api/public/scrub-profile error', err);
    return NextResponse.json(
      { error: 'Failed to load scrub profile' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const staffCode = String(body.staffCode || '').trim().toUpperCase();
    const scrubSize = String(body.scrubSize || '').trim().toUpperCase();
    const footwearSize = String(body.footwearSize || '').trim();
    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim().slice(0, 300)
        : null;

    if (!staffCode) {
      return NextResponse.json(
        { error: 'Staff code is required' },
        { status: 400 },
      );
    }
    if (!SCRUB_SIZES.includes(scrubSize)) {
      return NextResponse.json(
        { error: `Scrub size must be one of ${SCRUB_SIZES.join(', ')}` },
        { status: 400 },
      );
    }
    if (!footwearSize) {
      return NextResponse.json(
        { error: 'Footwear size is required' },
        { status: 400 },
      );
    }

    // Snapshot the matched user (if any) so pickup shows a name + role/colour.
    const user = await prisma.user.findFirst({
      where: { staffCode },
      select: { fullName: true, role: true },
    });

    const profile = await prisma.staffScrubProfile.upsert({
      where: { staffCode },
      create: {
        staffCode,
        scrubSize,
        footwearSize,
        notes,
        fullName: user?.fullName || null,
        role: user?.role || null,
      },
      update: {
        scrubSize,
        footwearSize,
        notes,
        // Refresh snapshot if the staff code now resolves to a user.
        ...(user
          ? { fullName: user.fullName, role: user.role }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      staffCode: profile.staffCode,
      scrubSize: profile.scrubSize,
      footwearSize: profile.footwearSize,
      scrubColor: colorForRole(profile.role),
      role: profile.role,
      fullName: profile.fullName,
    });
  } catch (err) {
    console.error('POST /api/public/scrub-profile error', err);
    return NextResponse.json(
      { error: 'Failed to save scrub profile' },
      { status: 500 },
    );
  }
}
