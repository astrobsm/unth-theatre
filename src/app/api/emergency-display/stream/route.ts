import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// SSE endpoint — pushes emergency alerts + bookings to connected display clients
// Android/browser display apps connect here for real-time updates
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Send a heartbeat immediately so clients know they're connected
      sendEvent('connected', { status: 'ok', timestamp: new Date().toISOString() });

      let lastHash = '';
      let iterations = 0;
      const MAX_ITERATIONS = 60; // ~5 min at 5s intervals, then client reconnects

      const poll = async () => {
        try {
          // Fetch active emergency alerts
          const alerts = await prisma.emergencySurgeryAlert.findMany({
            where: {
              status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
              displayOnTv: true,
            },
            include: {
              surgery: {
                include: { patient: true },
              },
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

          // Simple hash to detect changes
          const currentHash = JSON.stringify({ a: alerts.map(a => a.id + a.status + a.updatedAt), b: bookings.map(b => b.id + b.status + b.updatedAt) });

          if (currentHash !== lastHash) {
            lastHash = currentHash;
            sendEvent('emergencies', {
              alerts: alerts.map(a => ({
                id: a.id,
                type: 'ALERT',
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
              bookings: bookings.map(b => ({
                id: b.id,
                type: 'BOOKING',
                patientName: b.patientName,
                folderNumber: b.folderNumber,
                age: b.age,
                gender: b.gender,
                ward: b.ward,
                diagnosis: b.diagnosis,
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
              timestamp: new Date().toISOString(),
            });
          } else {
            // Send heartbeat so client knows connection is alive
            sendEvent('heartbeat', { timestamp: new Date().toISOString() });
          }

          iterations++;
          if (iterations >= MAX_ITERATIONS) {
            // Tell client to reconnect
            sendEvent('reconnect', { reason: 'max_iterations' });
            controller.close();
            return;
          }

          // Wait 5 seconds before next poll
          await new Promise(resolve => setTimeout(resolve, 5000));
          await poll();
        } catch (error) {
          console.error('SSE poll error:', error);
          try {
            sendEvent('error', { message: 'Server error, reconnecting...' });
            controller.close();
          } catch {
            // Stream already closed
          }
        }
      };

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
