/**
 * Chasing the members who have not answered yet.
 *
 * GET is the scheduled job, guarded by authoriseCron(). POST is the owner's
 * "remind non-responders" button.
 *
 * IT ONLY QUEUES. Sending is the dispatcher's job (/api/comms/dispatch, every
 * five minutes, via dispatchWhatsApp) and the send policy's — checkSendAllowed
 * inside queueMessage decides whether an external message may go at all, and
 * records it with a reason when it may not. Writing to WhatsApp from here would
 * route around the kill switch, the retry accounting and the audit trail.
 *
 * This deliberately does NOT follow /api/deadline-checker, which is the older
 * pattern in this codebase: that route has no authentication at all and writes
 * Notification rows inside swallowing catch blocks, so a reminder that fails
 * leaves nothing behind. Reported separately.
 *
 * THE REMINDER CANNOT CARRY THE MEMBER'S LINK, and that is a consequence of
 * hashing it rather than an oversight. Only the SHA-256 of each token is
 * stored, so there is no query that can rebuild somebody's personal URL — not
 * for this job and not for anyone with a database backup. So the reminder
 * points them at the message they already have. Where a member has genuinely
 * lost theirs, the Chairman reissues it from the round page, which mints a new
 * token and invalidates the old one.
 */
import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { authoriseCron } from '@/lib/cronAuth';
import { queueMessage } from '@/lib/comms/send';
import { requirePolicyOwner } from '@/lib/policy/guard';
import { formatClosing } from '@/lib/policy/invite';

export const dynamic = 'force-dynamic';

type Window = '48h' | '12h' | 'manual';

const HOUR = 60 * 60 * 1000;

interface Chased {
  roundId: string;
  window: Window;
  queued: number;
  skipped: number;
  nonResponders: number;
}

function reminderBody(opts: {
  name: string;
  policyTitle: string | null;
  closesAt: Date;
  window: Window;
  hoursLeft: number;
}): string {
  const title = opts.policyTitle?.trim() || 'the theatre operational flow policy';
  const urgency = opts.window === '12h'
    ? `*Closing in about ${Math.max(1, Math.round(opts.hoursLeft))} hours.*`
    : `*Closing ${formatClosing(opts.closesAt)}.*`;

  return [
    '*THEATRE POLICY REVIEW — REMINDER*',
    '',
    `Dear ${opts.name},`,
    '',
    `The Theatre Users Committee has not yet received your review of ${title}.`,
    urgency,
    '',
    'Please open the review link from the earlier message in this chat. It reopens '
    + 'where you left off, so anything you have already answered is still there, and '
    + 'you may skip any section outside your area.',
    '',
    'If you cannot find the link, reply here and the Secretariat will send you a new one.',
    '',
    'Theatre Users Committee, UNTH',
  ].join('\n');
}

/**
 * Queue a chase to everyone in one round who has not submitted.
 *
 * Idempotent through queueMessage: the trigger and scope identify the message,
 * so a cron that fires twice inside a window queues once.
 */
async function chase(roundId: string, window: Window, actorName?: string): Promise<Chased> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: roundId },
    select: {
      id: true,
      closesAt: true,
      document: { select: { title: true } },
    },
  });

  const nonResponders = await prisma.policyInvitation.findMany({
    where: { roundId, submittedAt: null, revokedAt: null },
    select: { id: true, inviteeName: true, phone: true, userId: true },
  });

  const hoursLeft = (round.closesAt.getTime() - Date.now()) / HOUR;
  let queued = 0;
  let skipped = 0;

  for (const invitee of nonResponders) {
    const hasSomewhereToSend = (invitee.phone ?? '').trim() !== '' || invitee.userId;
    if (!hasSomewhereToSend) {
      // No phone and no account: there is no channel. Counted rather than
      // silently dropped, so the round page can say "3 members have no phone
      // number on file" instead of appearing to have chased everybody.
      skipped += 1;
      continue;
    }

    const result = await queueMessage({
      channel: invitee.phone ? 'WHATSAPP' : 'IN_APP',
      priority: window === '12h' ? 'HIGH' : 'NORMAL',
      recipientUserId: invitee.userId ?? null,
      recipientName: invitee.inviteeName,
      recipientAddress: invitee.phone ?? null,
      recipientIsStaff: true,
      body: reminderBody({
        name: invitee.inviteeName,
        policyTitle: round.document?.title ?? null,
        closesAt: round.closesAt,
        window,
        hoursLeft,
      }),
      sensitivity: 'OPERATIONAL',
      relatedType: 'POLICY_REVIEW_ROUND',
      relatedId: round.id,
      trigger: 'policy-review-reminder',
      // The window is part of the identity, so the 48-hour and 12-hour chases
      // are different messages and neither suppresses the other.
      scope: `${round.id}:${invitee.id}:${window}`,
      createdByName: actorName ?? 'Scheduled reminder',
    });

    if (result.queued) queued += 1;
    else skipped += 1;

    await prisma.policyInvitation.update({
      where: { id: invitee.id },
      data: { reminderCount: { increment: 1 }, remindedAt: new Date() },
    });
  }

  return { roundId, window, queued, skipped, nonResponders: nonResponders.length };
}

export async function GET(request: NextRequest) {
  const auth = await authoriseCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'Not authorised to run this job' },
      { status: auth.status ?? 401 },
    );
  }

  // An administrator opening the URL in a browser inspects rather than acts,
  // following the house convention for these endpoints.
  const url = new URL(request.url);
  const dryRun = auth.who === 'administrator' && url.searchParams.get('run') !== 'true';

  try {
    const now = Date.now();
    const rounds = await prisma.policyReviewRound.findMany({
      where: { status: 'OPEN', closesAt: { gt: new Date() } },
      select: { id: true, closesAt: true, remindedAt48h: true, remindedAt12h: true },
    });

    const due: Array<{ id: string; window: Window }> = [];
    for (const round of rounds) {
      const hoursLeft = (round.closesAt.getTime() - now) / HOUR;
      // Thresholds rather than narrow windows: a cron that misses its slot --
      // a deploy, a cold start, a scheduler hiccup -- must still send the
      // chase once rather than skip it silently.
      if (hoursLeft <= 12 && !round.remindedAt12h) {
        due.push({ id: round.id, window: '12h' });
      } else if (hoursLeft <= 48 && !round.remindedAt48h) {
        due.push({ id: round.id, window: '48h' });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        who: auth.who,
        openRounds: rounds.length,
        wouldChase: due,
        note: 'Add ?run=true to actually queue the reminders.',
      });
    }

    const results: Chased[] = [];
    for (const item of due) {
      results.push(await chase(item.id, item.window));
      await prisma.policyReviewRound.update({
        where: { id: item.id },
        data: item.window === '12h' ? { remindedAt12h: new Date() } : { remindedAt48h: new Date() },
      });
    }

    return NextResponse.json({ ok: true, who: auth.who, openRounds: rounds.length, results });
  } catch (error) {
    console.error('[policy/reminders] GET failed', error);
    return NextResponse.json({ error: 'The reminder job failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const url = new URL(request.url);
    const roundId = url.searchParams.get('round');
    if (!roundId) {
      return NextResponse.json({ error: 'Which round?' }, { status: 400 });
    }

    const round = await prisma.policyReviewRound.findUnique({
      where: { id: roundId },
      select: { id: true, status: true },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });
    if (round.status !== 'OPEN') {
      return NextResponse.json(
        { error: 'The round is not open, so there is nothing to remind anybody about.' },
        { status: 400 },
      );
    }

    const result = await chase(round.id, 'manual', actor.name);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[policy/reminders] POST failed', err);
    return NextResponse.json({ error: 'Could not queue the reminders' }, { status: 500 });
  }
}
