import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// All standard UNTH Theatre Suites
const STANDARD_THEATRES = [
  {
    name: 'THEATRE 1 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Suction Machine',
      'Electrocautery',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 2 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Suction Machine',
      'C-Arm',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 3 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Suction Machine',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 4 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Suction Machine',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 5 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Suction Machine',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 1 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 2 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 3 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 4 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'NEUROSURGERY THEATRE',
    location: 'Neurosurgery Wing, 1st Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Neurosurgical Microscope',
      'Craniotomy Set',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'EMERGENCY THEATRE',
    location: 'Emergency Wing, 1st Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Portable Anesthesia',
      'Patient Monitor',
      'Emergency Cart',
      'Defibrillator',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'CTU THEATRE',
    location: 'Cardiothoracic Unit, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Heart-Lung Machine',
      'TEE Machine',
    ]),
    status: 'AVAILABLE',
  },
  {
    name: 'EYE THEATRE',
    location: 'Ophthalmology Wing, 1st Floor',
    capacity: 1,
    equipment: JSON.stringify([
      'Operating Table',
      'Anesthesia Machine',
      'Patient Monitor',
      'Surgical Lights',
      'Phaco Machine',
      'Operating Microscope',
    ]),
    status: 'AVAILABLE',
  },
];

// POST - Seed all standard theatres (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can seed theatres
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const results = {
      created: [] as string[],
      existing: [] as string[],
      errors: [] as string[],
    };

    for (const theatre of STANDARD_THEATRES) {
      try {
        // Check if theatre already exists
        const existing = await prisma.theatreSuite.findFirst({
          where: { name: theatre.name },
        });

        if (existing) {
          results.existing.push(theatre.name);
        } else {
          await prisma.theatreSuite.create({
            data: theatre as any,
          });
          results.created.push(theatre.name);
        }
      } catch (error) {
        results.errors.push(`${theatre.name}: ${error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${results.created.length} theatres, ${results.existing.length} already existed`,
      results,
    });
  } catch (error) {
    console.error('Error seeding theatres:', error);
    return NextResponse.json(
      { error: 'Failed to seed theatres' },
      { status: 500 }
    );
  }
}

// GET - Show current theatres and what would be added
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existingTheatres = await prisma.theatreSuite.findMany({
      select: { name: true },
    });

    const existingNames = existingTheatres.map(t => t.name);
    const missingTheatres = STANDARD_THEATRES.filter(t => !existingNames.includes(t.name));

    return NextResponse.json({
      existingCount: existingTheatres.length,
      existing: existingNames,
      missingCount: missingTheatres.length,
      missing: missingTheatres.map(t => t.name),
      standardCount: STANDARD_THEATRES.length,
    });
  } catch (error) {
    console.error('Error checking theatres:', error);
    return NextResponse.json(
      { error: 'Failed to check theatres' },
      { status: 500 }
    );
  }
}
