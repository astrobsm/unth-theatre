import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/roster/specialties
// The distinct surgical subspecialties currently in use, read live from the
// surgical_units table (admins maintain these at /dashboard/admin/surgical-units).
// Drives the anaesthetists roster's "Surgical Specialty" dropdown, so adding a
// unit in admin makes its specialty rosterable with no code change.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const units = await prisma.surgicalUnit.findMany({
      where: { active: true },
      select: { subspecialty: true },
      orderBy: { subspecialty: 'asc' },
    });
    const specialties = Array.from(
      new Set(units.map((u) => (u.subspecialty || '').trim()).filter(Boolean)),
    );
    return NextResponse.json({ specialties });
  } catch (error) {
    console.error('Error fetching surgical specialties:', error);
    return NextResponse.json({ error: 'Failed to fetch surgical specialties' }, { status: 500 });
  }
}
