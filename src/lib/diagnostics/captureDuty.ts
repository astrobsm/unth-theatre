import prisma from '@/lib/prisma';
import {
  DEPARTMENT_ROLES, describeOnDuty, resolveOnDuty, shiftAt,
  type DutyDepartment, type DutyCaptureResult, type OnDutyPerson,
} from '@/lib/diagnostics/onDuty';

/**
 * Read the roster, store who was on, and tell them.
 *
 * The only place that does this, so radiology, the laboratory and the fault
 * reports all behave the same way and all leave the same evidence.
 *
 * WHY THE ROSTER IS READ NOW AND WRITTEN DOWN. A request raised at 02:00 used
 * to name nobody. Establishing afterwards who should have answered it meant
 * reconstructing a roster from memory weeks later — badly, and usually in front
 * of a panel. The answer is stored with the request, so a roster edited next
 * week does not rewrite who was on when the theatre called.
 *
 * NOTHING HERE FAILS THE REQUEST. A clinical request must never be lost because
 * the notification step had a bad day, so every branch is caught and the worst
 * case is a capture that records nobody — which is itself a finding.
 */
export async function captureOnDuty(input: {
  kind: 'IMAGING_REQUEST' | 'LAB_REQUEST' | 'LAB_RESULT' | 'FAULT_REPORT';
  subjectId: string;
  department: DutyDepartment;
  at?: Date;
  /** What the people notified should be told to look at. */
  notify?: { title: string; message: string; link?: string };
}): Promise<DutyCaptureResult & { captureId: string | null; summary: string }> {
  const at = input.at ?? new Date();
  const { shift, rosterDate } = shiftAt(at);
  const roles = DEPARTMENT_ROLES[input.department] ?? [];

  const [rosterRows, registerRows] = await Promise.all([
    prisma.roster.findMany({
      where: {
        date: rosterDate,
        shift: shift as 'MORNING' | 'CALL' | 'NIGHT',
        staffCategory: input.department as never,
        // A draft roster is not a duty. Somebody pencilled in next month's
        // rota must not be telephoned at two in the morning.
        status: 'PUBLISHED',
        pendingRemoval: false,
      },
      select: { userId: true, staffName: true },
    }).catch(() => []),

    roles.length
      ? prisma.user.findMany({
          where: { role: { in: roles as never[] }, status: 'APPROVED' },
          select: { id: true, fullName: true, role: true, phoneNumber: true },
        }).catch(() => [])
      : [],
  ]);

  // The roster carries a name and a user id; the phone comes from the register.
  const phoneOf = new Map(registerRows.map((u) => [u.id, u.phoneNumber]));
  const roleOf = new Map(registerRows.map((u) => [u.id, u.role as string]));

  const rostered: OnDutyPerson[] = rosterRows.map((r) => ({
    userId: r.userId,
    name: r.staffName,
    role: roleOf.get(r.userId) ?? null,
    phone: phoneOf.get(r.userId) ?? null,
  }));

  const register: OnDutyPerson[] = registerRows.map((u) => ({
    userId: u.id, name: u.fullName, role: u.role as string, phone: u.phoneNumber,
  }));

  const result = resolveOnDuty({ department: input.department, at, rostered, register });
  const summary = describeOnDuty(result);

  let captureId: string | null = null;
  try {
    const row = await prisma.dutyCapture.create({
      data: {
        kind: input.kind,
        subjectId: input.subjectId,
        department: input.department,
        shift: result.shift,
        rosterDate: result.rosterDate,
        // Snapshotted, because the point is what the roster said THEN.
        staffOnDuty: JSON.stringify({
          fallback: result.fallback,
          staff: result.staff.map((p) => ({
            userId: p.userId, name: p.name, role: p.role ?? null, phone: p.phone ?? null,
          })),
        }),
        staffCount: result.staff.length,
      },
      select: { id: true },
    });
    captureId = row.id;
  } catch (err) {
    console.error('[captureOnDuty] could not store the capture:', err);
  }

  // Told individually, not broadcast. A notification addressed to everybody is
  // a notification addressed to nobody, which is how the emergency board became
  // unreadable the first time.
  if (input.notify && result.staff.length) {
    try {
      await prisma.systemNotification.createMany({
        data: result.staff.map((p) => ({
          userId: p.userId,
          // SYSTEM_ALERT rather than a new enum value: adding one would need a
          // migration on both nodes before a single notification could be sent.
          type: 'SYSTEM_ALERT',
          title: input.notify!.title,
          message: result.fallback
            ? `${input.notify!.message} (No one is rostered for this shift — you are being told because you hold the role.)`
            : input.notify!.message,
          actionUrl: input.notify!.link ?? null,
          priority: 'HIGH',
          relatedEntityType: input.kind,
          relatedEntityId: input.subjectId,
        })) as never,
      });
    } catch (err) {
      // The request stands. Losing a clinical request because a notification
      // insert failed would be a far worse outcome than a missed ping.
      console.error('[captureOnDuty] could not notify:', err);
    }
  }

  return { ...result, captureId, summary };
}

/** The capture stored against one request, for showing it back. */
export async function readCapture(kind: string, subjectId: string) {
  const row = await prisma.dutyCapture.findFirst({
    where: { kind: kind as never, subjectId },
    orderBy: { capturedAt: 'desc' },
  }).catch(() => null);
  if (!row) return null;

  let parsed: { fallback?: boolean; staff?: OnDutyPerson[] } = {};
  try { parsed = JSON.parse(row.staffOnDuty); } catch { /* stored text, read defensively */ }

  return {
    department: row.department,
    shift: row.shift,
    rosterDate: row.rosterDate,
    capturedAt: row.capturedAt,
    staffCount: row.staffCount,
    fallback: !!parsed.fallback,
    staff: Array.isArray(parsed.staff) ? parsed.staff : [],
  };
}
