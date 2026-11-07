// ============================================================
// Chase the theatre manager: this emergency has no room and nobody has taken it
// ------------------------------------------------------------
// GET  — who would be chased, where the review stands, how long it has sat.
// POST — send the chase.
//
// WHY THIS IS NOT THE TEAM CHASE. The team chase goes to everybody on the
// case and asks them to say whether they are coming. That is the right thing
// once a case HAS a theatre. Before it has one there is nobody to come to,
// and the people who can change that are not on the case at all: the theatre
// manager, the nurses on call who work the assignment panel, and the
// consultant anaesthetist whose review the room will be waiting on.
//
// WHO IS CHASED, AND WHY FROM THE ROSTER. The nurses are taken from the
// published on-call roster through resolveOnDutyTeam — the same resolver the
// booking card and the team chase use, deliberately, so the screen and the
// WhatsApp never name different people. Chasing by role instead would mean
// messaging all sixty-nine registered scrub nurses, which is a broadcast, and
// a broadcast is ignored within a fortnight.
//
// THE ANAESTHETIST IS TOLD WHETHER THE PATIENT HAS BEEN REVIEWED. Asked for
// explicitly. A theatre assigned to a case with no pre-anaesthetic review is
// a room standing empty with a team in it, so the two facts travel in one
// message rather than being actioned by two people each waiting on the other.
//
// THE QUEUE IS NOT A DELIVERY. queueMessage writes a row for a provider
// configured on the cloud and not on the theatre server, so every reachable
// person also comes back as a wa.me hand-off the sender presses while the
// screen is open.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { resolveOnDutyTeam, type StaffEntry } from '@/lib/roster/onDutyTeam';
import {
  locationForTheatreName, resolveEmergencyNursing,
} from '@/lib/roster/theatreNursing';
import { hourRuleStanding } from '@/lib/emergency/hourRule';
import {
  ASSIGNMENT_STEPS, assignmentNotificationLine, assignmentSummary,
  buildAssignmentChaseMessage, needsAssignment, readReviewState, reviewSentence,
  type AssignmentCaseFacts, type ChaseKind,
} from '@/lib/emergency/assignmentChase';

export const dynamic = 'force-dynamic';

/**
 * Who may fire this chase.
 *
 * The same list as the team chase, plus the surgeon who booked the case and
 * the anaesthetist named on it. The surgeon is the obvious presser: they are
 * the one sitting with a booked case and no acknowledgement, and the hour is
 * theirs.
 */
const CHASE_ROLES = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR',
  'CMAC', 'DC_MAC', 'THEATRE_CHAIRMAN', 'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
];

/**
 * Roles chased by name rather than from the roster.
 *
 * ONLY REAL UserRole VALUES. The assign-theatre endpoint's own ASSIGN_ROLES
 * list contains CIRCULATING_NURSE and NURSE_MANAGER, neither of which is in
 * the enum; they are harmless there because that list only gates a button,
 * but a findMany on them matches nobody while the screen reports success.
 * Checked against the enum on 7 November 2026.
 */
const MANAGER_ROLES = ['THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];
const MANAGEMENT_FALLBACK = ['ADMIN', 'SYSTEM_ADMINISTRATOR'];
const CONSULTANT_ANAESTHETIST_ROLE = 'CONSULTANT_ANAESTHETIST';

/**
 * The most consultant anaesthetists chased by role.
 *
 * Twenty are registered. The roster's on-call anaesthetists are chased by
 * name first; this is the net under them, not a mailing list.
 */
const CONSULTANT_CAP = 2;

const chaseSchema = z.object({
  note: z.string().max(500).optional(),
});

async function loadBooking(id: string) {
  return prisma.emergencySurgeryBooking.findUnique({
    where: { id },
    include: {
      // role is what tells a consultant from a registrar, and decides how
      // each of them is written to. See lib/emergency/consultantTone.
      surgeon: { select: { id: true, fullName: true, phoneNumber: true, role: true } },
      anesthetist: { select: { id: true, fullName: true, phoneNumber: true, role: true } },
      surgery: { select: { actualStartTime: true } },
      preAnaestheticReviews: {
        select: {
          status: true, reviewerName: true, fitnessDecision: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
      teamChases: { where: { kind: 'ASSIGNMENT' }, orderBy: { chasedAt: 'desc' }, take: 5 },
    },
  });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

interface Target {
  userId: string;
  name: string;
  phoneNumber: string | null;
  label: string;
  kind: ChaseKind;
  /** The role on the account, which decides the register. */
  role: string | null;
}

/**
 * Everybody who can move this case on, once each.
 *
 * Ordered by who can actually assign a room soonest, and deduplicated
 * first-slot-wins: the theatre manager on the roster is usually the one
 * holding the role, and two messages to one phone about one patient reads as
 * a broken system.
 */
async function resolveTargets(booking: LoadedBooking): Promise<{
  targets: Target[]; skipped: string[];
}> {
  const skipped: string[] = [];
  const targets: Target[] = [];
  const seen = new Set<string>();

  const add = (
    p: {
      id?: string; userId?: string; fullName?: string; name?: string;
      phoneNumber?: string | null; role?: string | null; userRole?: string | null;
    } | null,
    label: string,
    kind: ChaseKind,
  ) => {
    const userId = p?.userId ?? p?.id;
    const name = p?.name ?? p?.fullName;
    if (!userId || !name || seen.has(userId)) return;
    seen.add(userId);
    targets.push({
      userId,
      name,
      phoneNumber: p?.phoneNumber ?? null,
      label,
      kind,
      role: p?.role ?? p?.userRole ?? null,
    });
  };

  // NO theatreId filter, deliberately and permanently: on-call rosters are
  // published against the shift, not against a room, and this case has no
  // room -- that is the entire point of the chase.
  const roster = await resolveOnDutyTeam({
    date: new Date(booking.requiredByTime ?? booking.requestedAt),
    purpose: 'emergency',
  }).catch(() => null);

  const team = roster?.team;
  const fromStaff = (s: StaffEntry | null | undefined) => (s
    ? { userId: s.userId, name: s.name, phoneNumber: s.phoneNumber, role: s.role }
    : null);

  // 1. The theatre manager -- the person this chase was asked for.
  add(fromStaff(team?.theatreManager), 'Theatre Manager on duty', 'MANAGER');

  const managers = await prisma.user.findMany({
    where: { status: 'APPROVED' as never, role: { in: MANAGER_ROLES as never } },
    select: { id: true, fullName: true, phoneNumber: true, role: true },
    orderBy: { fullName: 'asc' },
  }).catch(() => []);
  managers.forEach((m) => add(
    m,
    m.role === 'THEATRE_CHAIRMAN' ? 'Theatre Chairman' : 'Theatre Manager',
    'MANAGER',
  ));

  // 2. The nurses who work the assignment panel, from the nursing posts named
  //    on the theatre staffing screen. Asked for on 7 November: until that
  //    screen existed these three slots resolved to nobody on every single
  //    chase, because there was nowhere in the application to name them.
  //
  //    Read through resolveEmergencyNursing rather than the on-duty team,
  //    because that resolver knows two things this chase needs and the
  //    general one does not: an A/E case is covered by the A/E pair and not
  //    by the main theatre's, and a nurse supervisor is found on the floor's
  //    shift rather than the emergency rota's.
  const nursing = await resolveEmergencyNursing({
    date: new Date(booking.requiredByTime ?? booking.requestedAt),
    location: locationForTheatreName(booking.theatreName),
  }).catch(() => null);

  const where = nursing?.location === 'A_AND_E' ? 'A/E theatre' : 'main theatre';
  add(nursing?.scrub ?? null, `Scrub Nurse on call (${where})`, 'NURSE');
  add(nursing?.circulating ?? null, `Circulating Nurse on call (${where})`, 'NURSE');

  // The supervisors, chased alongside the theatre manager, as asked.
  (nursing?.supervisors ?? []).forEach((s) => add(
    s, `Nurse Supervisor (${s.shift.toLowerCase()})`, 'NURSE',
  ));

  // Whoever the on-duty board would have named, if the posts above are empty.
  // Not a replacement: a fallback, so a day nobody staffed the screen still
  // reaches a nurse rather than nobody.
  if (!nursing?.scrub) add(fromStaff(team?.scrubNurse), 'Scrub Nurse on duty', 'NURSE');
  if (!nursing?.circulating) {
    add(fromStaff(team?.circulatingNurse), 'Circulating Nurse on duty', 'NURSE');
  }
  if (!(nursing?.supervisors ?? []).length) {
    (team?.supervisors ?? []).forEach((s, i) => add(
      fromStaff(s), `Nurse Supervisor ${i + 1}`, 'NURSE',
    ));
  }

  // 3. The consultant anaesthetist, who is told where the review stands.
  if (booking.anesthetist) {
    add(booking.anesthetist, 'Anaesthetist named on this booking', 'ANAESTHETIST');
  }
  add(fromStaff(team?.anaesthetist), 'Anaesthetist (1st on call)', 'ANAESTHETIST');
  add(fromStaff(team?.anaesthetist2), 'Anaesthetist (2nd on call)', 'ANAESTHETIST');

  const consultants = await prisma.user.findMany({
    where: { status: 'APPROVED' as never, role: CONSULTANT_ANAESTHETIST_ROLE as never },
    select: { id: true, fullName: true, phoneNumber: true },
    orderBy: { fullName: 'asc' },
  }).catch(() => []);
  consultants.slice(0, CONSULTANT_CAP).forEach((c) => add(
    { ...c, role: 'CONSULTANT_ANAESTHETIST' }, 'Consultant Anaesthetist', 'ANAESTHETIST',
  ));

  if (!targets.some((t) => t.kind === 'ANAESTHETIST')) {
    skipped.push(
      'No anaesthetist is named on this case, none is on the published on-call roster, '
      + 'and no consultant anaesthetist is registered — nobody was told about the review.',
    );
  }

  // 4. If nobody who can assign a room was found, somebody with authority
  //    hears it instead. A chase that silently reaches nobody is worse than
  //    no chase, because the screen says it was sent.
  if (!targets.some((t) => t.kind === 'MANAGER' || t.kind === 'NURSE')) {
    const standIn = await prisma.user.findMany({
      where: { status: 'APPROVED' as never, role: { in: MANAGEMENT_FALLBACK as never } },
      select: { id: true, fullName: true, phoneNumber: true },
      orderBy: { fullName: 'asc' },
    }).catch(() => []);
    standIn.slice(0, 3).forEach((u) => add(
      u, 'theatre management — no manager or on-call nurse could be found', 'MANAGEMENT',
    ));
    skipped.push(
      'No theatre manager and no nurse on the published roster could be found for this '
      + 'date, so the chase went to administration instead. Publish the nursing on-call '
      + 'roster so this reaches the room.',
    );
  }

  return { targets, skipped };
}

const factsOf = (booking: LoadedBooking, chasedByName?: string | null): AssignmentCaseFacts => ({
  patientName: booking.patientName,
  folderNumber: booking.folderNumber,
  procedureName: booking.procedureName,
  surgeonName: booking.surgeonName,
  ward: booking.ward,
  priority: booking.priority,
  chasedByName: chasedByName ?? null,
});

// GET — whether this chase is needed, and who it would reach.
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

    const standing = hourRuleStanding({
      requestedAt: booking.requestedAt,
      requiredByTime: booking.requiredByTime,
      actualStartTime: booking.surgery?.actualStartTime ?? null,
      status: booking.status,
    });
    const review = readReviewState(booking.preAnaestheticReviews);
    const { targets, skipped } = await resolveTargets(booking);

    return NextResponse.json({
      bookingId: booking.id,
      needed: needsAssignment(booking),
      status: booking.status,
      theatreName: booking.theatreName,
      bookedAt: booking.requestedAt,
      standing: {
        deadline: standing.deadline,
        minutesRemaining: standing.minutesRemaining,
        overdue: standing.overdue,
        settled: standing.settled,
        label: standing.label,
      },
      review: {
        done: review.done,
        started: review.started,
        reviewerName: review.reviewerName,
        at: review.at,
        fitness: review.fitness,
        sentence: reviewSentence(review),
      },
      summary: assignmentSummary(review),
      // Shown to the sender before they send it: nobody should put a formal
      // notice in front of a consultant body without reading it first.
      steps: ASSIGNMENT_STEPS,
      targets: targets.map((t) => ({
        name: t.name, label: t.label, kind: t.kind, reachable: Boolean(t.phoneNumber),
      })),
      skipped,
      canChase: CHASE_ROLES.includes(session.user.role)
        || booking.surgeonId === session.user.id
        || booking.anesthetistId === session.user.id,
      chases: booking.teamChases.map((c) => ({
        id: c.id,
        chasedAt: c.chasedAt,
        chasedByName: c.chasedByName,
        recipients: c.recipients,
        whatsappQueued: c.whatsappQueued,
      })),
    });
  } catch (error) {
    console.error('[emergency chase-assignment] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read this case' }, { status: 500 });
  }
}

// POST — chase the manager, the nurses on call and the consultant anaesthetist.
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

    const allowed = CHASE_ROLES.includes(session.user.role)
      || booking.surgeonId === session.user.id
      || booking.anesthetistId === session.user.id;
    if (!allowed) {
      return NextResponse.json(
        { error: 'Only the team on this case, or theatre management, can chase it.' },
        { status: 403 },
      );
    }

    // A case that already HAS a theatre has been acknowledged, and chasing
    // people to assign one is how a chase stops being read.
    if (!needsAssignment(booking)) {
      return NextResponse.json(
        {
          error: booking.theatreName
            ? `This case has already been acknowledged and assigned to ${booking.theatreName}.`
            : 'This case is no longer waiting for a theatre, so nobody was chased.',
        },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { note } = chaseSchema.parse(body ?? {});

    const chasedByName = session.user.name || 'Theatre';
    const standing = hourRuleStanding({
      requestedAt: booking.requestedAt,
      requiredByTime: booking.requiredByTime,
      actualStartTime: booking.surgery?.actualStartTime ?? null,
      status: booking.status,
    });
    const review = readReviewState(booking.preAnaestheticReviews);
    const facts = factsOf(booking, chasedByName);
    const { targets, skipped } = await resolveTargets(booking);

    if (targets.length === 0) {
      return NextResponse.json(
        {
          error: 'Nobody could be found to chase — no theatre manager, no nurse on the '
            + 'published roster and no administrator is registered. Tell the theatre directly.',
        },
        { status: 409 },
      );
    }

    const now = new Date();
    const handoffs: { name: string; kind: string; number: string; text: string }[] = [];
    let queued = 0;

    for (const target of targets) {
      const text = buildAssignmentChaseMessage({
        recipientName: target.name,
        recipientLabel: target.label,
        recipientRole: target.role,
        kind: target.kind,
        facts,
        standing,
        review,
        bookedAt: booking.requestedAt,
        note,
        now,
      });

      try {
        await prisma.notification.create({
          data: {
            userId: target.userId,
            type: 'EMERGENCY_TEAM_CHASE',
            title: standing.overdue
              ? `🚨 Emergency with NO THEATRE, past the hour — ${booking.procedureName}`
              : `🚨 Emergency with no theatre — ${booking.procedureName}`,
            message: assignmentNotificationLine(target.kind, standing, review),
            link: '/dashboard/emergency-booking',
          },
        });
      } catch (e) {
        console.error('[emergency chase-assignment] notification failed for', target.userId, e);
      }

      const wa = target.phoneNumber ? toWhatsAppNumber(target.phoneNumber) : null;
      try {
        const q = await queueMessage({
          channel: 'WHATSAPP' as never,
          priority: 'URGENT' as never,
          recipientUserId: target.userId,
          recipientName: target.name,
          recipientAddress: wa,
          recipientIsStaff: true,
          body: text,
          relatedType: 'EMERGENCY_BOOKING',
          relatedId: booking.id,
          trigger: 'EMERGENCY_ASSIGNMENT_CHASE',
          // One scope per person per round, so chasing twice sends twice --
          // which is the point of pressing it twice -- while one round
          // cannot double-send to the same handset.
          scope: `assign:${booking.id}:${target.userId}:${now.getTime()}`,
          createdById: session.user.id,
          createdByName: chasedByName,
        });
        if (q.queued) queued += 1;
        else if (q.reason) skipped.push(`${target.name}: ${q.reason}`);
      } catch (e) {
        console.error('[emergency chase-assignment] queue failed for', target.userId, e);
        skipped.push(`${target.name}: the message could not be queued. It is in their app.`);
      }

      if (wa) handoffs.push({ name: target.name, kind: target.label, number: wa, text });
      else skipped.push(`${target.name} (${target.label}) has no phone number on file — app only.`);
    }

    let chaseId: string | null = null;
    try {
      const row = await prisma.emergencyTeamChase.create({
        data: {
          emergencyBookingId: booking.id,
          kind: 'ASSIGNMENT',
          chasedAt: now,
          chasedById: session.user.id,
          chasedByName,
          deadlineAt: standing.deadline,
          minutesToDeadline: standing.minutesRemaining,
          overdue: standing.overdue,
          recipients: targets.length,
          expected: targets.length,
          responded: 0,
          reviewRecorded: review.done,
          rollCall: JSON.stringify(targets.map((t) => ({
            userId: t.userId,
            name: t.name,
            roleOnCase: t.label,
            kind: t.kind,
            reached: Boolean(t.phoneNumber),
          }))),
          whatsappQueued: queued,
          whatsappSkipped: skipped.length > 0 ? skipped.join(' | ') : null,
          note: (note ?? '').trim() || null,
        },
      });
      chaseId = row.id;
    } catch (e) {
      // The messages have gone. Losing the record is bad and is logged;
      // failing the request would tell the sender nothing was sent.
      console.error('[emergency chase-assignment] could not record the chase:', e);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyTeamChase',
        recordId: chaseId ?? booking.id,
        changes: JSON.stringify({
          kind: 'ASSIGNMENT',
          bookingId: booking.id,
          recipients: targets.length,
          reviewRecorded: review.done,
          minutesToDeadline: standing.minutesRemaining,
          overdue: standing.overdue,
          whatsappQueued: queued,
        }),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      chaseId,
      standing: {
        deadline: standing.deadline,
        minutesRemaining: standing.minutesRemaining,
        overdue: standing.overdue,
        label: standing.label,
      },
      review: { done: review.done, sentence: reviewSentence(review) },
      recipients: targets.length,
      targets: targets.map((t) => ({ name: t.name, label: t.label, kind: t.kind })),
      whatsappQueued: queued,
      whatsappSkipped: skipped,
      handoffs,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('[emergency chase-assignment] POST failed:', error);
    return NextResponse.json({ error: 'Failed to chase the theatre manager' }, { status: 500 });
  }
}
