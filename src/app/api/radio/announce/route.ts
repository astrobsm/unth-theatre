import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const announceSchema = z.object({
  category: z.enum([
    'WELCOME',
    'RULES',
    'MUSIC',
    'EMERGENCY',
    'WORKFLOW',
    'STAFF_REQUEST',
    'CONFIRMATION',
    'CUSTOM',
  ]),
  title: z.string().min(2),
  message: z.string().min(2),
  audioUrl: z.string().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  location: z.string().optional(),
  specialty: z.string().optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  requireAck: z.boolean().optional(),
  ackCode: z.string().optional(),
  repeatUntilAck: z.boolean().optional(),
  repeatEverySec: z.number().int().min(5).max(600).optional(),
  triggerSource: z.enum(['SYSTEM', 'MANUAL', 'SCHEDULED', 'EVENT']).optional(),
  metadata: z.any().optional(),
});

const ALLOWED_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CMAC',
  'DC_MAC',
  'SURGEON',
  'CONSULTANT_ANAESTHETIST',
  'ANAESTHETIST',
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (session.user as any).role as string;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = announceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const isEmergency = data.category === 'EMERGENCY';
  const priority = data.priority ?? (isEmergency ? 100 : 50);

  // For emergency: cancel any lower-priority PENDING/PLAYING music or routine
  if (isEmergency) {
    await prisma.radioAnnouncement.updateMany({
      where: {
        status: { in: ['PENDING', 'PLAYING'] },
        category: { in: ['MUSIC', 'WELCOME', 'RULES'] },
      },
      data: { status: 'CANCELLED' },
    });
  }

  const ann = await prisma.radioAnnouncement.create({
    data: {
      category: data.category,
      title: data.title,
      message: data.message,
      audioUrl: data.audioUrl,
      priority,
      location: data.location,
      specialty: data.specialty,
      urgency: data.urgency ?? (isEmergency ? 'CRITICAL' : undefined),
      triggerSource: data.triggerSource ?? 'MANUAL',
      triggeredById: (session.user as any).id,
      requireAck: data.requireAck ?? isEmergency,
      ackCode: data.ackCode,
      repeatUntilAck: data.repeatUntilAck ?? isEmergency,
      repeatEverySec: data.repeatEverySec ?? 30,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    },
  });

  return NextResponse.json({ announcement: ann });
}
