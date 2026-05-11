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

/**
 * Wrap a sentence so the TTS speaks it three times in a row, with a short
 * gap baked in via the connector text. Used for high-priority calls
 * (porter / cleaner) that the user wants spoken three times each cycle.
 */
export function speak3(s: string): string {
  return `${s} I repeat. ${s} Final call. ${s}`;
}

/**
 * Mark every PENDING / PLAYING radio announcement whose metadata JSON
 * contains the given key/value pair as ACKNOWLEDGED, so the radio service
 * stops looping it. Fire-and-forget — never throws.
 */
export async function acknowledgeRadioByMetadata(
  key: string,
  value: string,
  acknowledgedById?: string | null,
): Promise<number> {
  try {
    const needle = `"${key}":"${value}"`;
    const res = await prisma.radioAnnouncement.updateMany({
      where: {
        status: { in: ['PENDING', 'PLAYING'] },
        metadata: { contains: needle },
      },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: acknowledgedById ?? null,
      },
    });
    return res.count;
  } catch (err) {
    console.error('[radioEvents] failed to acknowledge announcements:', err);
    return 0;
  }
}
