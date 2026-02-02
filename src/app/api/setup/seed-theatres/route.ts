import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// All standard UNTH Theatre Suites
const STANDARD_THEATRES = [
  {
    name: 'THEATRE 1 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Suction Machine', 'Electrocautery']),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 2 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Suction Machine', 'C-Arm']),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 3 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Suction Machine']),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 4 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Suction Machine']),
    status: 'AVAILABLE',
  },
  {
    name: 'THEATRE 5 (VAMED)',
    location: 'VAMED Complex, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Suction Machine']),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 1 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights']),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 2 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights']),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 3 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights']),
    status: 'AVAILABLE',
  },
  {
    name: 'SUITE 4 (NIGERIAN SIDE)',
    location: 'Nigerian Complex, 2nd Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights']),
    status: 'AVAILABLE',
  },
  {
    name: 'NEUROSURGERY THEATRE',
    location: 'Neurosurgery Wing, 1st Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Neurosurgical Microscope', 'Craniotomy Set']),
    status: 'AVAILABLE',
  },
  {
    name: 'EMERGENCY THEATRE',
    location: 'Emergency Wing, 1st Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Portable Anesthesia', 'Patient Monitor', 'Emergency Cart', 'Defibrillator']),
    status: 'AVAILABLE',
  },
  {
    name: 'CTU THEATRE',
    location: 'Cardiothoracic Unit, Ground Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Heart-Lung Machine', 'TEE Machine']),
    status: 'AVAILABLE',
  },
  {
    name: 'EYE THEATRE',
    location: 'Ophthalmology Wing, 1st Floor',
    capacity: 1,
    equipment: JSON.stringify(['Operating Table', 'Anesthesia Machine', 'Patient Monitor', 'Surgical Lights', 'Phaco Machine', 'Operating Microscope']),
    status: 'AVAILABLE',
  },
];

// GET - Seed theatres with secret key
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  // Simple security - require a key
  if (key !== 'unth2026seed') {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
  }

  try {
    const results = {
      created: [] as string[],
      existing: [] as string[],
      errors: [] as string[],
    };

    for (const theatre of STANDARD_THEATRES) {
      try {
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
      } catch (error: any) {
        results.errors.push(`${theatre.name}: ${error?.message || error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${results.created.length} theatres, ${results.existing.length} already existed`,
      results,
    });
  } catch (error) {
    console.error('Error seeding theatres:', error);
    return NextResponse.json({ error: 'Failed to seed theatres' }, { status: 500 });
  }
}
