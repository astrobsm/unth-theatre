import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const VALID_LOCATIONS = ['WARD', 'HOLDING_AREA', 'THEATRE_SUITE', 'RECOVERY'] as const;
type Location = typeof VALID_LOCATIONS[number];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transfers = await prisma.patientTransfer.findMany({
      include: {
        patient: {
          select: {
            name: true,
            folderNumber: true,
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
          }
        }
      },
      orderBy: { transferTime: 'desc' },
      take: 50
    });

    return NextResponse.json(transfers);

  } catch (error) {
    console.error("Transfers fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const patientId    = typeof body.patientId === 'string' ? body.patientId.trim() : '';
    const fromLocation = typeof body.fromLocation === 'string' ? body.fromLocation.trim() : '';
    const toLocation   = typeof body.toLocation === 'string' ? body.toLocation.trim() : '';
    const notes        = typeof body.notes === 'string' ? body.notes.trim() : '';

    if (!patientId)    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
    if (!fromLocation) return NextResponse.json({ error: "fromLocation is required" }, { status: 400 });
    if (!toLocation)   return NextResponse.json({ error: "toLocation is required" }, { status: 400 });

    if (!VALID_LOCATIONS.includes(fromLocation as Location)) {
      return NextResponse.json({ error: `fromLocation must be one of ${VALID_LOCATIONS.join(', ')}` }, { status: 400 });
    }
    if (!VALID_LOCATIONS.includes(toLocation as Location)) {
      return NextResponse.json({ error: `toLocation must be one of ${VALID_LOCATIONS.join(', ')}` }, { status: 400 });
    }
    if (fromLocation === toLocation) {
      return NextResponse.json({ error: "fromLocation and toLocation must differ" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const transfer = await prisma.patientTransfer.create({
      data: {
        patientId,
        fromLocation: fromLocation as Location,
        toLocation:   toLocation   as Location,
        transferredBy: session.user.id,
        notes: notes || null,
      },
      include: {
        patient: { select: { name: true, folderNumber: true } },
        user: { select: { id: true, fullName: true, username: true } },
      },
    });

    // ----------------------------------------------------------------
    // Auto-broadcast every patient transfer on the theatre radio in
    // real time. The RadioPlayer polls /api/radio/queue every few
    // seconds, so creating a PENDING RadioAnnouncement here is enough
    // to make it speak on every connected client.
    // ----------------------------------------------------------------
    try {
      const prettyLocation = (loc: string) =>
        loc.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      const staffName =
        transfer.user?.fullName?.trim() ||
        transfer.user?.username?.trim() ||
        'a staff member';
      const patientName = transfer.patient?.name || 'Patient';
      const folder = transfer.patient?.folderNumber ? `, folder ${transfer.patient.folderNumber}` : '';
      const toRecovery = toLocation === 'RECOVERY';
      const message =
        `Patient transfer notice. ${patientName}${folder} has just been moved from ` +
        `${prettyLocation(fromLocation)} to ${prettyLocation(toLocation)} ` +
        `by ${staffName}.` +
        (notes ? ` Note: ${notes}.` : '');

      await prisma.radioAnnouncement.create({
        data: {
          category: 'WORKFLOW',
          title: toRecovery
            ? `Patient transferred to RECOVERY — ${patientName}`
            : `Patient transfer — ${patientName} → ${prettyLocation(toLocation)}`,
          message: toRecovery
            ? `Patient transferred to recovery. ${patientName}${folder} is now in recovery. Recovery team please attend.`
            : message,
          priority: toRecovery ? 80 : 70,
          location: prettyLocation(toLocation),
          urgency: toRecovery ? 'HIGH' : 'MEDIUM',
          triggerSource: 'EVENT',
          triggeredById: session.user.id,
          status: 'PENDING',
          requireAck: false,
          repeatUntilAck: false,
          metadata: JSON.stringify({
            patientTransferId: transfer.id,
            patientId: transfer.patientId,
            fromLocation,
            toLocation,
            source: 'PatientTransfer',
          }),
        },
      });

      // Porter call: every transfer needs a porter. Speak 3x and repeat
      // every 2 minutes until porter starts the transport (which acks the
      // call) or someone manually acknowledges from the radio bar.
      const speak3 = (s: string) => `${s} I repeat. ${s} Final call. ${s}`;
      const porterMsg =
        `Porter required to transport patient ${patientName}${folder} from ` +
        `${prettyLocation(fromLocation)} to ${prettyLocation(toLocation)}. ` +
        `Please respond and acknowledge.`;
      await prisma.radioAnnouncement.create({
        data: {
          category: 'STAFF_REQUEST',
          title: `Porter required — ${patientName}`,
          message: speak3(porterMsg),
          priority: 88,
          location: prettyLocation(fromLocation),
          urgency: 'HIGH',
          triggerSource: 'EVENT',
          triggeredById: session.user.id,
          status: 'PENDING',
          requireAck: true,
          repeatUntilAck: true,
          repeatEverySec: 120,
          metadata: JSON.stringify({
            patientTransferId: transfer.id,
            patientId: transfer.patientId,
            fromLocation,
            toLocation,
            source: 'PorterCall',
            kind: 'porter_call',
            tripleRepeat: true,
          }),
        },
      });
    } catch (radioErr) {
      // Never fail the transfer if the radio broadcast fails to enqueue.
      console.error('[transfers] failed to enqueue radio announcement:', radioErr);
    }

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    console.error("Transfer create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
