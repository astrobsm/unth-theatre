// ============================================================
// The evening watch on tomorrow's preoperative reviews
// ------------------------------------------------------------
// Runs twice: once at 7pm, once at 9pm, both WAT.
//
//   THE 7PM PASS TELLS THE HOD, while they can still do something. Anything
//   on tomorrow's list that is unreviewed, or that has been handed back with
//   nobody named in its place, goes in one message. Told at 9pm instead, the
//   HOD would be reading a list of findings rather than a list they can fix,
//   which is the difference between a warning and a reproach.
//
//   THE 9PM PASS RECORDS THE LAPSE and raises the summons.
//
// Both passes first write down WHO WAS EXPECTED TO REVIEW each case, which is
// the thing nobody could answer before. It is recorded from the published
// roster at the time the watch runs, not derived later: a roster published or
// amended after the fact would silently rewrite who was accountable, and an
// accountability record that moves is not one.
//
// NOTHING HERE DECIDES ANYTHING. Every judgement — the deadlines, whether a
// case lapsed, who answers for it — is a pure function in reviewWatch.ts with
// tests against it. This file finds the rows, calls those, and writes the
// result down. That split is deliberate: the rules are the contentious part
// and they should be provable without a database.
//
// IDEMPOTENT. hodNotifiedAt and lapsedAt are written as part of the same
// update that records the finding, and the unique index on audit_summonses
// means a second pass cannot duplicate a notice. The watch is safe to run by
// hand, twice, or after a failure half way through.
// ============================================================

import prisma from '@/lib/prisma';
import { watDay, watDayRange } from '@/lib/watDay';
import { queueMessage } from '@/lib/comms/send';
import { pushToUsers } from '@/lib/pushAll';
import {
  classifyAnaesthetistAssignment,
  type RosterRow,
} from '@/lib/anaesthetistAssignment';
import {
  accountableFor,
  needsHodNotice,
  reviewWatchState,
  reviewDeadline,
  type ReviewWatchInput,
} from '@/lib/anaesthesia/reviewWatch';

export interface WatchSummary {
  /** The operating day examined, as a WAT calendar date. */
  day: string;
  live: boolean;
  casesExamined: number;
  assignmentsWritten: number;
  hodNoticesSent: number;
  lapsesRecorded: number;
  summonsesRaised: number;
  /** Anything the pass declined to act on, and why. */
  notes: string[];
}

/**
 * Statuses worth watching: everything that is not already settled.
 *
 * Derived from SETTLED_STATUSES rather than listed, so the two cannot drift.
 * An earlier version of this hand-listed CONFIRMED and POSTPONED, neither of
 * which is a SurgeryStatus — the query would have thrown on the first run.
 */
const WATCHED_STATUSES = ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE'] as const;

/** The WAT calendar day after the one `now` falls in. */
export function targetDay(now: Date): string {
  const today = watDay(now);
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Run one pass.
 *
 * `dryRun` writes nothing and sends nothing but reports what it would have
 * done — which is how an administrator can look at tonight's list without
 * putting a summons on anybody's name.
 */
export async function runPreopReviewWatch(
  opts: { now?: Date; dryRun?: boolean; day?: string } = {},
): Promise<WatchSummary> {
  const now = opts.now ?? new Date();
  const live = !opts.dryRun;
  const day = opts.day ?? targetDay(now);
  const notes: string[] = [];
  const out: WatchSummary = {
    day, live, casesExamined: 0, assignmentsWritten: 0,
    hodNoticesSent: 0, lapsesRecorded: 0, summonsesRaised: 0, notes,
  };

  const { start, end } = watDayRange(day);

  const surgeries = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      status: { in: [...WATCHED_STATUSES] },
    },
    select: {
      id: true, scheduledDate: true, createdAt: true, status: true,
      procedureName: true, subspecialty: true, unit: true,
      anesthetistId: true, surgeonId: true, bookedById: true, bookedByName: true,
      patient: { select: { name: true, folderNumber: true } },
      anesthetist: { select: { id: true, fullName: true } },
      preOpReviews: {
        select: { id: true, reviewDate: true, anesthetistId: true, createdAt: true },
        take: 1,
      },
      reviewAssignment: true,
    },
  });
  out.casesExamined = surgeries.length;
  if (surgeries.length === 0) {
    notes.push(`No cases on the list for ${day}.`);
    return out;
  }

  // The day's PUBLISHED anaesthetist roster. Drafts are somebody's work in
  // progress and would answer a different question.
  const rosterRows: RosterRow[] = (await prisma.roster.findMany({
    where: {
      date: new Date(`${day}T00:00:00.000Z`),
      staffCategory: 'ANAESTHETISTS',
      status: 'PUBLISHED',
    },
    select: { userId: true, shift: true, subRole: true },
  })).map((r) => ({ userId: r.userId, shift: String(r.shift), subRole: r.subRole }));

  if (rosterRows.length === 0) {
    // Said out loud rather than inferred from a page of rota-gap findings.
    notes.push(
      `No published anaesthetist roster for ${day}. Every case will read as a rota gap, `
      + 'and no individual anaesthetist will be summoned.',
    );
  }

  /** Cases the HOD needs to hear about in this pass, gathered into one message. */
  const forHod: string[] = [];

  for (const s of surgeries) {
    const review = s.preOpReviews[0] ?? null;
    const a = s.reviewAssignment;

    const assignmentSource = classifyAnaesthetistAssignment({
      anaesthetistId: s.anesthetistId,
      subspecialty: s.subspecialty,
      rosterRows,
    });

    const input: ReviewWatchInput = {
      surgeryDate: s.scheduledDate,
      bookedAt: s.createdAt,
      status: s.status,
      expectedReviewerId: s.anesthetistId,
      assignmentSource,
      reviewedAt: review?.reviewDate ?? null,
      reviewedById: review?.anesthetistId ?? null,
      handedBackAt: a?.handedBackAt ?? null,
      reassignedToId: a?.reassignedToId ?? null,
      reassignedAt: a?.reassignedAt ?? null,
    };

    // Written every pass, so the record of who was expected tracks the roster
    // as it stood tonight rather than as it is re-read months later.
    if (live) {
      await prisma.preopReviewAssignment.upsert({
        where: { surgeryId: s.id },
        create: {
          surgeryId: s.id,
          surgeryDate: new Date(`${day}T00:00:00.000Z`),
          expectedReviewerId: s.anesthetistId,
          expectedReviewerName: s.anesthetist?.fullName ?? null,
          assignmentSource,
          reviewedAt: review?.reviewDate ?? null,
          reviewedById: review?.anesthetistId ?? null,
        },
        update: {
          expectedReviewerId: s.anesthetistId,
          expectedReviewerName: s.anesthetist?.fullName ?? null,
          assignmentSource,
          reviewedAt: review?.reviewDate ?? null,
          reviewedById: review?.anesthetistId ?? null,
        },
      });
    }
    out.assignmentsWritten += 1;

    const state = reviewWatchState(input, now);
    const label = `${s.patient?.name ?? 'Patient'} (${s.patient?.folderNumber ?? '—'}) — `
      + `${s.procedureName}, ${s.anesthetist?.fullName ?? 'no anaesthetist named'}`;

    // ---- the 7pm job: tell the HOD while it can still be fixed ----
    if (needsHodNotice(input, now) && !a?.hodNotifiedAt) {
      forHod.push(label);
      if (live) {
        await prisma.preopReviewAssignment.update({
          where: { surgeryId: s.id }, data: { hodNotifiedAt: now },
        });
      }
      out.hodNoticesSent += 1;
    }

    // ---- the 9pm job: record the lapse and summon ----
    if (state === 'LAPSED' && !a?.lapsedAt) {
      const who = accountableFor(input);
      if (!who) continue;

      if (live) {
        await prisma.preopReviewAssignment.update({
          where: { surgeryId: s.id },
          data: { lapsedAt: now, lapseGround: who.ground },
        });
      }
      out.lapsesRecorded += 1;

      const raised = await raiseSummonses({
        ground: who.ground, reason: who.reason, userId: who.userId,
        surgeryId: s.id, bookedById: s.bookedById, bookedByName: s.bookedByName,
        caseLabel: label, day, live,
      });
      out.summonsesRaised += raised;
    }
  }

  if (forHod.length > 0) await tellTheHod(forHod, day, live);

  return out;
}

/**
 * Raise the summons, resolving a role to the people holding it.
 *
 * Returns how many were raised. A ground with no individual behind it — a
 * rota gap, an unmade reassignment — calls the HOD of Anaesthesia; a case
 * booked too late calls whoever booked it. Both of those come back as a null
 * userId from accountableFor, which is why the resolution lives here, next to
 * the database that can answer it, rather than in the pure rules.
 */
async function raiseSummonses(args: {
  ground: string; reason: string; userId: string | null;
  surgeryId: string; bookedById: string | null; bookedByName: string | null;
  caseLabel: string; day: string; live: boolean;
}): Promise<number> {
  const { ground, reason, userId, surgeryId, caseLabel, day, live } = args;

  const targets: Array<{ id: string; name: string; roleOnCase: string }> = [];

  if (userId) {
    const u = await prisma.user.findUnique({
      where: { id: userId }, select: { id: true, fullName: true },
    });
    if (u) targets.push({ id: u.id, name: u.fullName, roleOnCase: 'Assigned anaesthetist' });
  } else if (ground === 'booked-too-late' && args.bookedById) {
    const u = await prisma.user.findUnique({
      where: { id: args.bookedById }, select: { id: true, fullName: true },
    });
    if (u) targets.push({ id: u.id, name: u.fullName, roleOnCase: 'Booked the case' });
  } else if (ground === 'rota-gap' || ground === 'hod-did-not-reassign') {
    const hods = await prisma.user.findMany({
      where: { role: 'HEAD_OF_ANAESTHESIA', status: 'APPROVED' },
      select: { id: true, fullName: true },
    });
    for (const h of hods) {
      targets.push({ id: h.id, name: h.fullName, roleOnCase: 'Head of Anaesthesia' });
    }
  }

  if (targets.length === 0) return 0;
  if (!live) return targets.length;

  let n = 0;
  for (const t of targets) {
    try {
      await prisma.auditSummons.create({
        data: {
          cause: 'PREOP_REVIEW_LAPSE',
          ground,
          userId: t.id,
          personName: t.name,
          roleOnCase: t.roleOnCase,
          surgeryId,
          reason: `${reason} Case: ${caseLabel}, listed for ${day}.`,
        },
      });
      n += 1;
    } catch {
      // The unique index refusing a second copy is the expected outcome on a
      // re-run, not a fault. Anything else is swallowed too: a summons that
      // cannot be written must not stop the rest of the night's list.
      continue;
    }

    await prisma.notification.create({
      data: {
        userId: t.id,
        type: 'AUDIT_SUMMONS',
        title: 'Summons to the theatre audit',
        message: `${reason} Case: ${caseLabel}.`,
        link: '/dashboard/theatre-audit/summonses',
      },
    }).catch(() => undefined);

    await pushToUsers([t.id], {
      title: 'Summons to the theatre audit',
      body: caseLabel,
      url: '/dashboard/theatre-audit/summonses',
    }).catch(() => undefined);
  }
  return n;
}

/** One message, listing every case, rather than one per case. */
async function tellTheHod(cases: string[], day: string, live: boolean): Promise<void> {
  if (!live) return;
  const hods = await prisma.user.findMany({
    where: { role: 'HEAD_OF_ANAESTHESIA', status: 'APPROVED' },
    select: { id: true, fullName: true, phoneNumber: true },
  });
  if (hods.length === 0) return;

  const body =
    `${cases.length} case${cases.length === 1 ? '' : 's'} on tomorrow's list (${day}) `
    + 'have no preoperative anaesthetic review and the 7pm reassignment deadline has passed. '
    + 'The review deadline is 9pm, after which a summons to the theatre audit is raised '
    + `automatically.\n\n${cases.map((c) => `• ${c}`).join('\n')}`;

  for (const h of hods) {
    await prisma.notification.create({
      data: {
        userId: h.id,
        type: 'PREOP_REVIEW_WATCH',
        title: `${cases.length} unreviewed case${cases.length === 1 ? '' : 's'} for tomorrow`,
        message: body,
        link: '/dashboard/preop-reviews',
      },
    }).catch(() => undefined);

    await pushToUsers([h.id], {
      title: `${cases.length} unreviewed case${cases.length === 1 ? '' : 's'} for tomorrow`,
      body: 'The 7pm reassignment deadline has passed. Review deadline is 9pm.',
      url: '/dashboard/preop-reviews',
    }).catch(() => undefined);

    // WhatsApp goes out only once a template for it is approved by Meta.
    // queueMessage records the refusal rather than throwing, so this is safe
    // to call now and starts working the day the template lands.
    await queueMessage({
      channel: 'WHATSAPP',
      priority: 'HIGH',
      recipientUserId: h.id,
      recipientName: h.fullName,
      recipientAddress: h.phoneNumber ?? null,
      recipientIsStaff: true,
      templateCode: 'PREOP_REVIEW_OVERDUE',
      body,
      sensitivity: 'OPERATIONAL',
      variables: { name: h.fullName, count: String(cases.length), date: day },
      trigger: 'preop-review-watch',
      scope: `hod:${day}`,
      relatedType: 'preop-review-watch',
      relatedId: day,
    }).catch(() => undefined);
  }
}

/** Exposed for the route's dry-run display. */
export { reviewDeadline };
