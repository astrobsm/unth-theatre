import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// POST /api/radio/events
// Generic ingestion endpoint for workflow events. Other modules can call this
// when patient flow milestones occur and the radio service will speak.
//
// Supported events (extensible):
//   patient.arrival_holding_area
//   patient.received_holding_area
//   patient.transfer_to_operating_room
//   patient.checklist_completed
//   patient.knife_on_skin
//   patient.end_of_surgery        -> also triggers porter/cleaner call
//   patient.transfer_to_ward
//   surgery.documentation_completed
//   staff.request                 -> requires { role, location }
//   custom                        -> uses provided title+message

const eventSchema = z.object({
  event: z.string().min(2),
  patientName: z.string().optional(),
  patientId: z.string().optional(),
  location: z.string().optional(),
  specialty: z.string().optional(),
  surgeryName: z.string().optional(),
  durationMins: z.number().optional(),
  staffRole: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  metadata: z.any().optional(),
});

function buildAnnouncement(d: z.infer<typeof eventSchema>) {
  const loc = d.location ? ` at ${d.location}` : '';
  const pt = d.patientName ? ` for patient ${d.patientName}` : '';

  switch (d.event) {
    case 'patient.arrival_holding_area':
      return {
        category: 'WORKFLOW',
        title: 'Patient arrival',
        message: `Patient${pt} has arrived at the holding area${loc}.`,
        priority: 60,
      };
    case 'patient.received_holding_area':
      return {
        category: 'WORKFLOW',
        title: 'Patient received',
        message: `Patient${pt} has been received and confirmed at the holding area${loc}.`,
        priority: 60,
      };
    case 'patient.transfer_to_operating_room':
      return {
        category: 'WORKFLOW',
        title: 'Transfer to theatre',
        message: `Patient${pt} is being transferred to the operating room${loc}.`,
        priority: 65,
      };
    case 'patient.checklist_completed':
      return {
        category: 'WORKFLOW',
        title: 'Pre-op checklist complete',
        message: `Pre-operative checklist completed${loc}. Surgical team please confirm readiness.`,
        priority: 65,
      };
    case 'patient.knife_on_skin':
      return {
        category: 'WORKFLOW',
        title: 'Surgery started',
        message: `Knife on skin${loc}${d.surgeryName ? ` for ${d.surgeryName}` : ''}. Surgery has commenced.`,
        priority: 70,
      };
    case 'patient.end_of_surgery': {
      const dur = d.durationMins ? ` Total procedure duration: ${d.durationMins} minutes.` : '';
      return {
        category: 'WORKFLOW',
        title: 'End of surgery',
        message: `Surgery completed${loc}.${dur}`,
        priority: 70,
      };
    }
    case 'patient.transfer_to_ward':
      return {
        category: 'WORKFLOW',
        title: 'Patient transferred',
        message: `Patient${pt} transferred to the ward${loc}.`,
        priority: 55,
      };
    case 'surgery.documentation_completed':
      return {
        category: 'CONFIRMATION',
        title: 'Documentation complete',
        message: 'Procedure documentation completed successfully. Next action initiated.',
        priority: 50,
      };
    case 'staff.request':
      return {
        category: 'STAFF_REQUEST',
        title: `Staff request: ${d.staffRole ?? 'staff'}`,
        message: `${d.staffRole ?? 'Staff'} required${loc}. Please respond and acknowledge.`,
        priority: 80,
        requireAck: true,
        repeatUntilAck: true,
      };
    case 'custom':
      return {
        category: 'CUSTOM',
        title: d.title ?? 'Theatre announcement',
        message: d.message ?? '',
        priority: 50,
      };
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
  }
  const d = parsed.data;
  const spec = buildAnnouncement(d);
  if (!spec) {
    return NextResponse.json({ error: `Unknown event: ${d.event}` }, { status: 400 });
  }

  const created: any[] = [];
  const main = await prisma.radioAnnouncement.create({
    data: {
      category: spec.category,
      title: spec.title,
      message: spec.message,
      priority: spec.priority,
      location: d.location,
      specialty: d.specialty,
      triggerSource: 'EVENT',
      triggeredById: (session.user as any).id,
      requireAck: (spec as any).requireAck ?? false,
      repeatUntilAck: (spec as any).repeatUntilAck ?? false,
      repeatEverySec: 30,
      metadata: JSON.stringify({ event: d.event, ...d.metadata }),
    },
  });
  created.push(main);

  // Special case: end-of-surgery → call porters & cleaners (looped, ack required)
  if (d.event === 'patient.end_of_surgery') {
    const porterCall = await prisma.radioAnnouncement.create({
      data: {
        category: 'STAFF_REQUEST',
        title: 'Porters & cleaners required',
        message: `Porters and theatre cleaners required${d.location ? ` at ${d.location}` : ''} for case turnover. Please log in and acknowledge.`,
        priority: 85,
        location: d.location,
        triggerSource: 'EVENT',
        triggeredById: (session.user as any).id,
        requireAck: true,
        repeatUntilAck: true,
        repeatEverySec: 45,
        metadata: JSON.stringify({ relatedEvent: d.event }),
      },
    });
    created.push(porterCall);
  }

  return NextResponse.json({ created });
}
