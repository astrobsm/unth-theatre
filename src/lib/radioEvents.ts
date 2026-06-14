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

/** Derive the duty shift from a JS Date (matches /api/roster/on-duty). */
function shiftFromDate(d: Date): 'MORNING' | 'CALL' | 'NIGHT' {
  const h = d.getHours();
  if (h >= 8 && h < 16) return 'MORNING';
  if (h >= 16 && h < 22) return 'CALL';
  return 'NIGHT';
}

export interface OnDutyStaff {
  name: string;
  staffCode: string | null;
  phoneNumber: string | null;
}

/**
 * Fetch the on-duty porters and cleaners for a given moment, optionally scoped
 * to a theatre. Used to name the staff in radio invitation announcements.
 * Never throws — returns empty arrays on any failure.
 */
export async function getOnDutyPortersAndCleaners(
  when: Date = new Date(),
  theatreId?: string | null,
): Promise<{ porters: OnDutyStaff[]; cleaners: OnDutyStaff[] }> {
  try {
    const shift = shiftFromDate(when);
    const dateOnly = new Date(
      Date.UTC(when.getFullYear(), when.getMonth(), when.getDate()),
    );

    const where: {
      date: Date;
      shift: 'MORNING' | 'CALL' | 'NIGHT';
      staffCategory: { in: ('PORTERS' | 'CLEANERS')[] };
      theatreId?: string;
    } = {
      date: dateOnly,
      shift,
      staffCategory: { in: ['PORTERS', 'CLEANERS'] },
    };
    if (theatreId && theatreId !== 'any' && theatreId !== 'all') {
      where.theatreId = theatreId;
    }

    const rosters = await prisma.roster.findMany({
      where,
      include: {
        user: {
          select: { fullName: true, staffCode: true, phoneNumber: true },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    const porters: OnDutyStaff[] = [];
    const cleaners: OnDutyStaff[] = [];
    for (const r of rosters) {
      const entry: OnDutyStaff = {
        name: r.staffName || r.user?.fullName || 'Staff',
        staffCode: r.user?.staffCode ?? null,
        phoneNumber: r.user?.phoneNumber ?? null,
      };
      if (r.staffCategory === 'PORTERS') porters.push(entry);
      else if (r.staffCategory === 'CLEANERS') cleaners.push(entry);
    }
    return { porters, cleaners };
  } catch (err) {
    console.error('[radioEvents] failed to fetch on-duty porters/cleaners:', err);
    return { porters: [], cleaners: [] };
  }
}

/**
 * Format a list of staff into a readable "by name" phrase for announcements.
 * e.g. ["Mr Okafor", "Mr Bello"] -> "Mr Okafor and Mr Bello".
 */
export function namesPhrase(staff: OnDutyStaff[]): string {
  const names = staff.map((s) => s.name).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
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
