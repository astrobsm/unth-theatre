// ============================================================
// "It has not started, and this is what is stopping it."
// ------------------------------------------------------------
// GET   — the blockers on this case, open and cleared, with the reason list
//         and where the case stands against the hour.
// POST  — record a blocker and chase whoever can clear it.
// PATCH — record that a blocker is cleared.
//
// WHY THIS IS NOT THE TEAM CHASE. "Chase the team" chases the team. This
// chases the person who can move the thing in the way, which is usually not
// the team at all: a scrub nurse who has not arrived is not made to arrive by
// a fourth message to her handset — she is replaced by whoever the theatre
// manager can find. Blood is the blood bank. A dead generator is works and
// the power plant. Each reason carries its own recipients; see
// lib/emergency/blockers.ts.
//
// ANY SIGNED-IN MEMBER OF STAFF MAY REPORT, and that is the point. The person
// who knows the case cannot start is whoever is standing in the room, and
// that is as often the technician or the circulating nurse as the consultant.
// Restricting it to seniors would leave the fact unrecorded until somebody
// senior noticed — which is the delay being measured. The same decision was
// taken for elective cases in /api/case-blockers, for the same reason.
//
// THE QUEUE IS NOT A DELIVERY. queueMessage writes a row for a provider
// configured on the cloud and not on the theatre server, so every reachable
// recipient also comes back as a wa.me hand-off the reporter can press while
// the screen is still open. That is the part that reaches a phone tonight.
//
// NOTHING HERE CLOSES A BLOCKER BY ITSELF. Not a timer, not the case later
// starting, not silence. A person records that it is cleared, or it stays
// open — the same rule the water faults follow, and for the same reason: a
// thing that closes itself was never recorded.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { triggerRadio } from '@/lib/radioEvents';
import { hourRuleStanding } from '@/lib/emergency/hourRule';
import {
  EMERGENCY_BLOCKER_REASONS, blockerProblem, blockerSpec,
  buildBlockerChaseMessage, blockerNotificationLine, complianceLine,
  describeBlocker, type BlockerCaseFacts,
} from '@/lib/emergency/blockers';

export const dynamic = 'force-dynamic';

/**
 * Who may record that a blocker is cleared.
 *
 * Narrower than reporting, deliberately. Reporting is a fact anybody in the
 * room can see; clearing is a claim that the way is now open, and a case that
 * is waved clear by somebody who was not involved starts again into the same
 * wall. The reporter, the team on the case, and theatre management.
 */
const RESOLVE_ROLES = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR',
  'CMAC', 'DC_MAC', 'THEATRE_CHAIRMAN', 'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
];

/**
 * The most people chased in one role.
 *
 * POWER_OR_UTILITY names five roles, and a hospital with nine registered
 * power-plant operators would otherwise send forty-odd messages about one
 * generator. Three is enough that somebody answers and few enough that the
 * next one is still read. Whoever is left out is named in the result rather
 * than dropped silently.
 */
const PER_ROLE_CAP = 3;

/**
 * Who hears it when nobody holds the role that owns it.
 *
 * Found on the live system the day this shipped: of the twenty-three roles
 * this catalogue chases, nine have no approved account at all -- there is no
 * registered theatre manager, no blood bank, no biomedical engineer, no works
 * supervisor and no emergency laboratory. Seven reasons, NO_BLOOD among them,
 * would therefore have reached nobody but the booking surgeon, and where the
 * surgeon is the one reporting it they are not chased about their own report
 * -- so a blocker on blood for an emergency laparotomy would have gone
 * precisely nowhere.
 *
 * That is a gap in who is registered, not in the code, and registering those
 * accounts is the real fix. Until then a blocker that cannot find its owner
 * goes to whoever can give the order instead, and the message says plainly
 * that is why they are getting it. A chase that silently reaches nobody is
 * worse than no chase, because the screen says it was sent.
 */
const NO_OWNER_FALLBACK = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_CHAIRMAN',
];

const reportSchema = z.object({
  reason: z.string().min(1),
  detail: z.string().max(600).optional(),
});

const resolveSchema = z.object({
  blockerId: z.string().min(1),
  note: z.string().max(600).optional(),
});

async function loadBooking(id: string) {
  return prisma.emergencySurgeryBooking.findUnique({
    where: { id },
    include: {
      surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
      anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      surgery: { select: { actualStartTime: true } },
    },
  });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

const standingOf = (booking: LoadedBooking) => hourRuleStanding({
  requestedAt: booking.requestedAt,
  requiredByTime: booking.requiredByTime,
  actualStartTime: booking.surgery?.actualStartTime ?? null,
  status: booking.status,
});

const factsOf = (booking: LoadedBooking): BlockerCaseFacts => ({
  patientName: booking.patientName,
  folderNumber: booking.folderNumber,
  procedureName: booking.procedureName,
  theatreName: booking.theatreName,
  surgeonName: booking.surgeonName,
  ward: booking.ward,
});

const rowOut = (b: {
  id: string; reason: string; detail: string | null; reportedByName: string;
  reportedByRole: string | null; reportedAt: Date; overdueWhenReported: boolean;
  minutesToDeadline: number | null; resolvedAt: Date | null;
  resolvedByName: string | null; resolvedNote: string | null;
  whatsappQueued: number; chased: string | null; reportedById: string | null;
}) => ({
  id: b.id,
  reason: b.reason,
  label: blockerSpec(b.reason)?.label ?? b.reason,
  owner: blockerSpec(b.reason)?.owner ?? null,
  detail: b.detail,
  line: describeBlocker({ reason: b.reason, detail: b.detail, reportedByName: b.reportedByName }),
  reportedById: b.reportedById,
  reportedByName: b.reportedByName,
  reportedByRole: b.reportedByRole,
  reportedAt: b.reportedAt,
  overdueWhenReported: b.overdueWhenReported,
  minutesToDeadline: b.minutesToDeadline,
  resolvedAt: b.resolvedAt,
  resolvedByName: b.resolvedByName,
  resolvedNote: b.resolvedNote,
  whatsappQueued: b.whatsappQueued,
  chased: (() => {
    try {
      return b.chased ? (JSON.parse(b.chased) as { name: string; label: string }[]) : [];
    } catch {
      return [];
    }
  })(),
});

// GET — what is holding this case up, and what could be said about it.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const booking = await loadBooking(params.id);
    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    const rows = await prisma.emergencyCaseBlocker.findMany({
      where: { emergencyBookingId: booking.id },
      orderBy: { reportedAt: 'desc' },
    });

    const standing = standingOf(booking);
    const open = rows.filter((r) => !r.resolvedAt);

    return NextResponse.json({
      bookingId: booking.id,
      standing: {
        deadline: standing.deadline,
        minutesRemaining: standing.minutesRemaining,
        overdue: standing.overdue,
        settled: standing.settled,
        label: standing.label,
      },
      // Sent rather than hard-coded in the page, so the list and the people it
      // chases can never drift apart on one side of the wire.
      reasons: EMERGENCY_BLOCKER_REASONS.map((r) => ({
        code: r.code,
        label: r.label,
        owner: r.owner,
        needsDetail: Boolean(r.needsDetail),
      })),
      blockers: rows.map(rowOut),
      openCount: open.length,
      canResolve: RESOLVE_ROLES.includes(session.user.role)
        || booking.surgeonId === session.user.id
        || booking.anesthetistId === session.user.id,
    });
  } catch (error) {
    console.error('[emergency blocker] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read the blockers on this case' }, { status: 500 });
  }
}

// POST — record a blocker and chase whoever can clear it.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const booking = await loadBooking(params.id);
    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { reason, detail: rawDetail } = reportSchema.parse(body ?? {});
    const detail = (rawDetail ?? '').trim() || null;

    const spec = blockerSpec(reason);
    const problem = blockerProblem(reason, detail);
    if (!spec || problem) {
      return NextResponse.json({ error: problem ?? 'Choose what is stopping this case.' }, { status: 400 });
    }

    const standing = standingOf(booking);
    const facts = factsOf(booking);
    const reportedByName = session.user.name || 'A member of staff';
    const reportedByRole = session.user.role ?? null;
    const now = new Date();

    // ── Who hears about it ────────────────────────────────────────────────
    //
    // The roles that can clear this particular thing, plus the booking surgeon
    // — the hour is theirs and a blocker on their case is their business —
    // plus the anaesthetist where the blocker is an anaesthetic one. The
    // reporter is never chased about their own report.
    const byRole = spec.roles.length > 0
      ? await prisma.user.findMany({
        where: { status: 'APPROVED' as never, role: { in: spec.roles as never } },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
        orderBy: { fullName: 'asc' },
      }).catch(() => [])
      : [];

    const recipients: {
      userId: string; name: string; phoneNumber: string | null; label: string; role: string | null;
    }[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>([session.user.id]);

    const add = (
      p: { id: string; fullName: string; phoneNumber: string | null; role?: string | null },
      label: string,
    ) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      recipients.push({
        userId: p.id,
        name: p.fullName,
        phoneNumber: p.phoneNumber,
        label,
        role: p.role ?? null,
      });
    };

    for (const role of spec.roles) {
      const inRole = byRole.filter((u) => u.role === role);
      if (inRole.length === 0) {
        // Named, not swallowed. A hospital with nobody registered in the role
        // that owns this blocker is a fact the reporter should learn now,
        // standing in the theatre, rather than when nobody turns up.
        skipped.push(
          `Nobody is registered on the system as ${role.replace(/_/g, ' ').toLowerCase()} — `
          + 'nobody was chased in that role.',
        );
        continue;
      }
      inRole.slice(0, PER_ROLE_CAP).forEach((u) => add(u, role.replace(/_/g, ' ').toLowerCase()));
      if (inRole.length > PER_ROLE_CAP) {
        skipped.push(
          `${inRole.length - PER_ROLE_CAP} more ${role.replace(/_/g, ' ').toLowerCase()} `
          + 'were not messaged — the first few were.',
        );
      }
    }

    // Nobody at all holds the roles that own this one. See NO_OWNER_FALLBACK:
    // the blocker goes to whoever can give the order instead, labelled with
    // the reason they are receiving it, rather than reaching nobody while the
    // screen says it was sent.
    const foundAnOwner = recipients.length > 0;
    if (spec.roles.length > 0 && !foundAnOwner) {
      const standIn = await prisma.user.findMany({
        where: { status: 'APPROVED' as never, role: { in: NO_OWNER_FALLBACK as never } },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
        orderBy: { fullName: 'asc' },
      }).catch(() => []);
      standIn.slice(0, PER_ROLE_CAP).forEach((u) => add(
        u,
        `theatre management — nobody is registered as ${spec.owner}`,
      ));
      if (standIn.length === 0) {
        skipped.push(
          'No theatre management account could be found either, so this blocker has '
          + 'reached nobody but the people on the case. Tell somebody directly.',
        );
      }
    }

    if (booking.surgeon) add(booking.surgeon, 'surgeon who booked this case');
    if (spec.tellAnaesthetist && booking.anesthetist) {
      add(booking.anesthetist, 'anaesthetist on this case');
    }

    // ── Record it first ───────────────────────────────────────────────────
    //
    // Before a single message goes out. A chase that was sent against a report
    // that failed to save is the one outcome with no way back: the recipients
    // act on a case with nothing in its record, and the reporter files again.
    const row = await prisma.emergencyCaseBlocker.create({
      data: {
        emergencyBookingId: booking.id,
        reason,
        detail,
        reportedById: session.user.id ?? null,
        reportedByName,
        reportedByRole,
        reportedAt: now,
        deadlineAt: standing.deadline,
        minutesToDeadline: standing.minutesRemaining,
        overdueWhenReported: standing.overdue,
      },
    });

    // ── Chase ─────────────────────────────────────────────────────────────
    const handoffs: { name: string; kind: string; number: string; text: string }[] = [];
    let queued = 0;

    for (const person of recipients) {
      const text = buildBlockerChaseMessage({
        spec,
        detail,
        recipientName: person.name,
        recipientLabel: person.label,
        facts,
        standing,
        reportedByName,
        reportedByRole,
      });

      // The app first: it is the only channel certain to arrive, and it is
      // where the screen they are being sent to lives.
      try {
        await prisma.notification.create({
          data: {
            userId: person.userId,
            type: 'EMERGENCY_BLOCKER',
            title: standing.overdue
              ? `🚧 Emergency held up PAST THE HOUR — ${spec.label}`
              : `🚧 Emergency held up — ${spec.label}`,
            message: blockerNotificationLine(spec, detail, standing),
            link: '/dashboard/emergency-booking',
          },
        });
      } catch (e) {
        console.error('[emergency blocker] notification failed for', person.userId, e);
      }

      const wa = person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null;
      try {
        const q = await queueMessage({
          channel: 'WHATSAPP' as never,
          priority: 'URGENT' as never,
          recipientUserId: person.userId,
          recipientName: person.name,
          recipientAddress: wa,
          recipientIsStaff: true,
          body: text,
          relatedType: 'EMERGENCY_BOOKING',
          relatedId: booking.id,
          trigger: 'EMERGENCY_BLOCKER',
          // Scoped to this report and this person: reporting the same thing
          // twice is two chases, which is the point of reporting it twice,
          // while one report cannot double-send to one handset.
          scope: `${row.id}:${person.userId}`,
          createdById: session.user.id,
          createdByName: reportedByName,
        });
        if (q.queued) queued += 1;
        else if (q.reason) skipped.push(`${person.name}: ${q.reason}`);
      } catch (e) {
        console.error('[emergency blocker] queue failed for', person.userId, e);
        skipped.push(`${person.name}: the message could not be queued. It is in their app.`);
      }

      if (wa) handoffs.push({ name: person.name, kind: person.label, number: wa, text });
      else skipped.push(`${person.name} (${person.label}) has no phone number on file — app only.`);
    }

    if (recipients.length === 0) {
      skipped.push(
        'Nobody could be found to chase for this reason. The blocker is recorded against '
        + 'the case — tell the theatre manager directly.',
      );
    }

    try {
      await prisma.emergencyCaseBlocker.update({
        where: { id: row.id },
        data: {
          chased: JSON.stringify(recipients.map((p) => ({
            userId: p.userId,
            name: p.name,
            role: p.role,
            label: p.label,
            reached: Boolean(p.phoneNumber),
          }))),
          whatsappQueued: queued,
          whatsappSkipped: skipped.length > 0 ? skipped.join(' | ') : null,
        },
      });
    } catch (e) {
      // The messages have gone. Losing the note of who got them is bad and is
      // logged; failing the request would tell the reporter nothing was sent.
      console.error('[emergency blocker] could not record who was chased:', e);
    }

    // Say it out loud only once the hour has gone. A theatre that is twenty
    // minutes into the hour does not need an announcement, and an announcement
    // nobody needs is how people learn to ignore the ones that matter.
    if (standing.overdue) {
      try {
        await triggerRadio({
          category: 'WORKFLOW',
          title: `Emergency held up — ${spec.label}`,
          message: `${booking.theatreName ?? 'Theatre'}. ${booking.procedureName} is past the hour. `
            + `Reason: ${spec.label}${detail ? ` — ${detail}` : ''}. ${spec.owner} has been chased.`,
          location: booking.theatreName ?? null,
          urgency: 'HIGH',
          requireAck: false,
          repeatUntilAck: false,
          triggeredById: session.user.id,
          metadata: { emergencyBookingId: booking.id, blockerId: row.id, reason },
        });
      } catch (e) {
        console.warn('[emergency blocker] radio failed (non-fatal):', e);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyCaseBlocker',
        recordId: row.id,
        changes: JSON.stringify({
          bookingId: booking.id,
          reason,
          minutesToDeadline: standing.minutesRemaining,
          overdueWhenReported: standing.overdue,
          chased: recipients.length,
          whatsappQueued: queued,
        }),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      blocker: rowOut({ ...row, chased: null, whatsappQueued: queued }),
      compliance: complianceLine(standing),
      standing: {
        deadline: standing.deadline,
        minutesRemaining: standing.minutesRemaining,
        overdue: standing.overdue,
        label: standing.label,
      },
      owner: spec.owner,
      chased: recipients.map((p) => ({ name: p.name, label: p.label })),
      whatsappQueued: queued,
      whatsappSkipped: skipped,
      handoffs,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('[emergency blocker] POST failed:', error);
    return NextResponse.json({ error: 'That could not be recorded. Please try again.' }, { status: 500 });
  }
}

// PATCH — a person records that the way is now open.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const booking = await loadBooking(params.id);
    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { blockerId, note } = resolveSchema.parse(body ?? {});

    const existing = await prisma.emergencyCaseBlocker.findUnique({ where: { id: blockerId } });
    if (!existing || existing.emergencyBookingId !== booking.id) {
      return NextResponse.json({ error: 'That blocker is not on this case.' }, { status: 404 });
    }
    if (existing.resolvedAt) {
      return NextResponse.json(
        { error: `Already cleared by ${existing.resolvedByName ?? 'somebody'}.` },
        { status: 409 },
      );
    }

    const allowed = RESOLVE_ROLES.includes(session.user.role)
      || booking.surgeonId === session.user.id
      || booking.anesthetistId === session.user.id
      || existing.reportedById === session.user.id;
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Only the person who reported this, the team on the case, or theatre '
            + 'management can record that it is cleared.',
        },
        { status: 403 },
      );
    }

    const updated = await prisma.emergencyCaseBlocker.update({
      where: { id: blockerId },
      data: {
        resolvedAt: new Date(),
        resolvedById: session.user.id ?? null,
        resolvedByName: session.user.name || 'A member of staff',
        resolvedNote: (note ?? '').trim() || null,
      },
    });

    // Tell the person who reported it. They are the one who has been waiting,
    // and a blocker that is cleared in silence leaves them still waiting.
    if (existing.reportedById && existing.reportedById !== session.user.id) {
      await prisma.notification.create({
        data: {
          userId: existing.reportedById,
          type: 'EMERGENCY_BLOCKER',
          title: '✅ Blocker cleared',
          message: `${blockerSpec(existing.reason)?.label ?? existing.reason} on `
            + `${booking.procedureName} — cleared by ${updated.resolvedByName}`
            + `${updated.resolvedNote ? `: ${updated.resolvedNote}` : ''}.`,
          link: '/dashboard/emergency-booking',
        },
      }).catch(() => undefined);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'EmergencyCaseBlocker',
        recordId: blockerId,
        changes: JSON.stringify({ bookingId: booking.id, resolved: true, reason: existing.reason }),
      },
    }).catch(() => undefined);

    const remaining = await prisma.emergencyCaseBlocker.count({
      where: { emergencyBookingId: booking.id, resolvedAt: null },
    });

    return NextResponse.json({ blocker: rowOut(updated), openCount: remaining });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('[emergency blocker] PATCH failed:', error);
    return NextResponse.json({ error: 'That could not be recorded. Please try again.' }, { status: 500 });
  }
}
