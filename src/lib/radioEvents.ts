import prisma from '@/lib/prisma';

interface RadioEventInput {
  category:
    | 'EMERGENCY'
    | 'WORKFLOW'
    | 'STAFF_REQUEST'
    | 'CONFIRMATION'
    | 'CUSTOM';
  title: string;
  message: string;
  priority?: number;
  location?: string | null;
  specialty?: string | null;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requireAck?: boolean;
  repeatUntilAck?: boolean;
  repeatEverySec?: number;
  triggeredById?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Server-side helper to push an announcement onto the Theatre Radio queue.
 * Fire-and-forget: never throws (logs only) so it cannot break the calling
 * business operation.
 */
export async function triggerRadio(input: RadioEventInput): Promise<void> {
  try {
    const isEmergency = input.category === 'EMERGENCY';
    const priority =
      input.priority ?? (isEmergency ? 100 : input.category === 'STAFF_REQUEST' ? 80 : 55);

    if (isEmergency) {
      // Emergencies override routine playback
      await prisma.radioAnnouncement.updateMany({
        where: {
          status: { in: ['PENDING', 'PLAYING'] },
          category: { in: ['MUSIC', 'WELCOME', 'RULES'] },
        },
        data: { status: 'CANCELLED' },
      });
    }

    await prisma.radioAnnouncement.create({
      data: {
        category: input.category,
        title: input.title,
        message: input.message,
        priority,
        location: input.location ?? null,
        specialty: input.specialty ?? null,
        urgency: input.urgency ?? (isEmergency ? 'CRITICAL' : undefined),
        triggerSource: 'EVENT',
        triggeredById: input.triggeredById ?? null,
        requireAck: input.requireAck ?? isEmergency,
        repeatUntilAck:
          input.repeatUntilAck ?? (isEmergency || input.category === 'STAFF_REQUEST'),
        repeatEverySec: input.repeatEverySec ?? 30,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  } catch (err) {
    // Never break the host operation
    console.error('[radioEvents] failed to enqueue announcement:', err);
  }
}
