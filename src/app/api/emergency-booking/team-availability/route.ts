import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for responding to emergency team availability
const respondAvailabilitySchema = z.object({
  emergencyBookingId: z.string(),
  status: z.enum(['AVAILABLE', 'EN_ROUTE', 'ARRIVED', 'UNAVAILABLE', 'ON_ANOTHER_CASE']),
  teamRole: z.enum([
    'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE',
    'ANAESTHETIC_TECHNICIAN', 'PORTER', 'RECOVERY_ROOM_NURSE',
    'THEATRE_STORE_KEEPER', 'BIOMEDICAL_ENGINEER', 'CLEANER',
    'BLOODBANK_STAFF', 'PHARMACIST'
  ]),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  estimatedArrivalMin: z.number().optional(),
  notes: z.string().optional(),
});

// Map user roles to emergency team roles
function mapUserRoleToTeamRole(userRole: string): string | null {
  const mapping: Record<string, string> = {
    'SURGEON': 'SURGEON',
    'ANAESTHETIST': 'ANAESTHETIST',
    'CONSULTANT_ANAESTHETIST': 'ANAESTHETIST',
    'SCRUB_NURSE': 'SCRUB_NURSE',
    'RECOVERY_ROOM_NURSE': 'RECOVERY_ROOM_NURSE',
    'ANAESTHETIC_TECHNICIAN': 'ANAESTHETIC_TECHNICIAN',
    'PORTER': 'PORTER',
    'THEATRE_STORE_KEEPER': 'THEATRE_STORE_KEEPER',
    'BIOMEDICAL_ENGINEER': 'BIOMEDICAL_ENGINEER',
    'CLEANER': 'CLEANER',
    'BLOODBANK_STAFF': 'BLOODBANK_STAFF',
    'PHARMACIST': 'PHARMACIST',
    'ADMIN': 'SURGEON',
    'THEATRE_MANAGER': 'SURGEON',
    'SYSTEM_ADMINISTRATOR': 'SURGEON',
  };
  return mapping[userRole] || null;
}

// Calculate distance using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

// UNTH Ituku-Ozalla coordinates (approximate)
const HOSPITAL_LAT = 6.3936;
const HOSPITAL_LON = 7.5078;

// GET - Fetch team availability for a specific emergency booking
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
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
          select: {
            id: true,
            fullName: true,
            role: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: [
        { teamRole: 'asc' },
        { respondedAt: 'desc' },
      ],
    });

    // Group by role for dashboard display
    const grouped: Record<string, typeof availability> = {};
    for (const item of availability) {
      const role = item.teamRole;
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push(item);
    }

    // Count summary
    const summary = {
      total: availability.length,
      available: availability.filter(a => a.status === 'AVAILABLE').length,
      enRoute: availability.filter(a => a.status === 'EN_ROUTE').length,
      arrived: availability.filter(a => a.status === 'ARRIVED').length,
      unavailable: availability.filter(a => a.status === 'UNAVAILABLE' || a.status === 'ON_ANOTHER_CASE').length,
    };

    return NextResponse.json({ availability, grouped, summary });
  } catch (error) {
    console.error('Error fetching team availability:', error);
    return NextResponse.json({ error: 'Failed to fetch team availability' }, { status: 500 });
  }
}

// POST - Submit or update team availability
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = respondAvailabilitySchema.parse(body);

    // Verify the booking exists
    const booking = await prisma.emergencySurgeryBooking.findUnique({
      where: { id: validated.emergencyBookingId },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    // Calculate distance if coordinates provided
    let distanceKm: number | null = null;
    if (validated.latitude && validated.longitude) {
      distanceKm = calculateDistance(
        validated.latitude, validated.longitude,
        HOSPITAL_LAT, HOSPITAL_LON
      );
    }

    // Determine team role from user role if not explicitly set
    const teamRole = validated.teamRole || mapUserRoleToTeamRole(session.user.role);
    if (!teamRole) {
      return NextResponse.json(
        { error: 'Could not determine team role for this user' },
        { status: 400 }
      );
    }

    // Upsert - update if already responded, create if new
    const result = await prisma.emergencyTeamAvailability.upsert({
      where: {
        emergencyBookingId_userId: {
          emergencyBookingId: validated.emergencyBookingId,
          userId: session.user.id,
        },
      },
      update: {
        status: validated.status as any,
        latitude: validated.latitude,
        longitude: validated.longitude,
        locationTimestamp: validated.latitude ? new Date() : undefined,
        estimatedArrivalMin: validated.estimatedArrivalMin,
        distanceKm,
        notes: validated.notes,
        arrivedAt: validated.status === 'ARRIVED' ? new Date() : undefined,
        respondedAt: new Date(),
      },
      create: {
        emergencyBookingId: validated.emergencyBookingId,
        userId: session.user.id,
        userName: session.user.name || 'Unknown',
        teamRole: teamRole as any,
        status: validated.status as any,
        latitude: validated.latitude,
        longitude: validated.longitude,
        locationTimestamp: validated.latitude ? new Date() : undefined,
        estimatedArrivalMin: validated.estimatedArrivalMin,
        distanceKm,
        notes: validated.notes,
        arrivedAt: validated.status === 'ARRIVED' ? new Date() : undefined,
      },
    });

    // Create notification for theatre manager
    try {
      const managers = await prisma.user.findMany({
        where: { role: 'THEATRE_MANAGER', status: 'APPROVED' },
        select: { id: true },
      });

      for (const mgr of managers) {
        await prisma.notification.create({
          data: {
            userId: mgr.id,
            title: `Emergency Team Response: ${session.user.name}`,
            message: `${session.user.name} (${teamRole}) is ${validated.status} for emergency case: ${booking.procedureName}`,
            type: 'EMERGENCY',
          },
        });
      }
    } catch (e) {
      // Non-critical: notification creation may fail
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error updating team availability:', error);
    return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 });
  }
}
