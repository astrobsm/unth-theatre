import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const TEAM_ROLE_MAP: Record<string, string> = {
  SURGEON: 'SURGEON',
  ANAESTHETIST: 'ANAESTHETIST',
  CONSULTANT_ANAESTHETIST: 'ANAESTHETIST',
  SCRUB_NURSE: 'SCRUB_NURSE',
  RECOVERY_ROOM_NURSE: 'RECOVERY_ROOM_NURSE',
  THEATRE_STORE_KEEPER: 'THEATRE_STORE_KEEPER',
  ANAESTHETIC_TECHNICIAN: 'ANAESTHETIC_TECHNICIAN',
  PORTER: 'PORTER',
  BIOMEDICAL_ENGINEER: 'BIOMEDICAL_ENGINEER',
  CLEANER: 'CLEANER',
  BLOODBANK_STAFF: 'BLOODBANK_STAFF',
  PHARMACIST: 'PHARMACIST',
};

const respondSchema = z.object({
  emergencyBookingId: z.string(),
  status: z.enum(['AVAILABLE', 'EN_ROUTE', 'ARRIVED', 'UNAVAILABLE', 'ON_ANOTHER_CASE']),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  estimatedArrivalMin: z.number().optional(),
  notes: z.string().optional(),
});

// GET - Fetch team availability for a specific emergency booking
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    const availability = await prisma.emergencyTeamAvailability.findMany({
      where: { emergencyBookingId: bookingId },
      include: {
        user: {
          select: { id: true, fullName: true, phoneNumber: true, role: true },
        },
      },
      orderBy: [{ teamRole: 'asc' }, { respondedAt: 'desc' }],
    });

    return NextResponse.json(availability);
  } catch (error) {
    console.error('Error fetching team availability:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST - Team member responds with availability + geo-location
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = respondSchema.parse(body);

    // Map user role to EmergencyTeamRole
    const teamRole = TEAM_ROLE_MAP[session.user.role];
    if (!teamRole) {
      return NextResponse.json(
        { error: 'Your role is not part of the emergency surgical team' },
        { status: 403 }
      );
    }

    // Verify booking exists
    const booking = await prisma.emergencySurgeryBooking.findUnique({
      where: { id: data.emergencyBookingId },
    });
    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    // Calculate distance if coords provided (simple Haversine to UNTH Ituku-Ozalla)
    let distanceKm: number | undefined;
    if (data.latitude && data.longitude) {
      // UNTH Ituku-Ozalla approximate coordinates
      const hospitalLat = 6.4025;
      const hospitalLng = 7.5103;
      distanceKm = haversineDistance(data.latitude, data.longitude, hospitalLat, hospitalLng);
    }

    // Upsert — user can update their response
    const record = await prisma.emergencyTeamAvailability.upsert({
      where: {
        emergencyBookingId_userId: {
          emergencyBookingId: data.emergencyBookingId,
          userId: session.user.id,
        },
      },
      update: {
        status: data.status as any,
        latitude: data.latitude,
        longitude: data.longitude,
        locationTimestamp: data.latitude ? new Date() : undefined,
        estimatedArrivalMin: data.estimatedArrivalMin,
        distanceKm,
        notes: data.notes,
        arrivedAt: data.status === 'ARRIVED' ? new Date() : undefined,
      },
      create: {
        emergencyBookingId: data.emergencyBookingId,
        userId: session.user.id,
        userName: session.user.name || '',
        teamRole: teamRole as any,
        status: data.status as any,
        latitude: data.latitude,
        longitude: data.longitude,
        locationTimestamp: data.latitude ? new Date() : undefined,
        estimatedArrivalMin: data.estimatedArrivalMin,
        distanceKm,
        notes: data.notes,
        arrivedAt: data.status === 'ARRIVED' ? new Date() : undefined,
      },
      include: {
        user: {
          select: { id: true, fullName: true, phoneNumber: true, role: true },
        },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error recording team availability:', error);
    return NextResponse.json({ error: 'Failed to record availability' }, { status: 500 });
  }
}

// Haversine formula for distance in km
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
