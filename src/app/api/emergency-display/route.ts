import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public API for display screens — no auth required (kiosk/Android display)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch active emergency alerts
    const alerts = await prisma.emergencySurgeryAlert.findMany({
      where: {
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
        displayOnTv: true,
      },
      include: {
        surgery: { include: { patient: true } },
        surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      },
      orderBy: [{ priority: 'asc' }, { alertTriggeredAt: 'desc' }],
    });

    // Fetch active emergency bookings not yet started
    const bookings = await prisma.emergencySurgeryBooking.findMany({
      where: {
        status: { in: ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED'] },
      },
      include: {
        surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      },
      orderBy: [{ priority: 'asc' }, { requestedAt: 'desc' }],
    });

    const emergencies = [
      ...alerts.map(a => ({
        id: a.id,
        type: 'ALERT' as const,
        patientName: a.patientName,
        folderNumber: a.folderNumber,
        age: a.age,
        gender: a.gender,
        procedureName: a.procedureName,
        surgicalUnit: a.surgicalUnit,
        indication: a.indication,
        surgeonName: a.surgeonName,
        anesthetistName: a.anesthetist?.fullName || null,
        theatreName: a.theatreName,
        priority: a.priority,
        status: a.status,
        bloodRequired: a.bloodRequired,
        bloodUnits: a.bloodUnits,
        specialEquipment: a.specialEquipment,
        alertMessage: a.alertMessage,
        additionalNotes: a.additionalNotes,
        alertTriggeredAt: a.alertTriggeredAt?.toISOString(),
        estimatedStartTime: a.estimatedStartTime?.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
      ...bookings
        // Exclude bookings that already have an active alert to avoid duplicates
        .filter(b => !alerts.some(a => a.surgeryId === b.surgeryId && b.surgeryId))
        .map(b => ({
          id: b.id,
          type: 'BOOKING' as const,
          patientName: b.patientName,
          folderNumber: b.folderNumber,
          age: b.age,
          gender: b.gender,
          ward: b.ward,
          diagnosis: b.diagnosis || b.indication,
          procedureName: b.procedureName,
          surgicalUnit: b.surgicalUnit,
          indication: b.indication,
          surgeonName: b.surgeonName,
          anesthetistName: b.anesthetist?.fullName || b.anesthetistName || null,
          theatreName: b.theatreName,
          priority: b.priority,
          status: b.status,
          classification: b.classification,
          bloodRequired: b.bloodRequired,
          bloodType: b.bloodType,
          bloodUnits: b.bloodUnits,
          specialEquipment: b.specialEquipment,
          specialRequirements: b.specialRequirements,
          requiredByTime: b.requiredByTime?.toISOString(),
          requestedAt: b.requestedAt.toISOString(),
          estimatedDuration: b.estimatedDuration,
          createdAt: b.createdAt.toISOString(),
        })),
    ];

    return NextResponse.json({
      emergencies,
      count: emergencies.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching emergency display data:', error);
    return NextResponse.json({ emergencies: [], count: 0, timestamp: new Date().toISOString() });
  }
}
