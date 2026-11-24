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
 * THE REMINDER CARRIES THE MEMBER'S LINK. It cannot be read back -- only the
 * SHA-256 of each token is stored, on purpose -- so one is MINTED per member,
 * with the link it replaces left working (PolicyInvitation.priorTokenHash, see
 * src/lib/policy/reminderLink.ts). A chase whose whole point is "please go and
 * do this" must not be the thing that breaks the link in their WhatsApp.
 *
 * MINT, THEN QUEUE, THEN ROLL BACK IF REFUSED. queueMessage() may decline --
 * the kill switch, the duplicate window -- and a link rotated for a message
 * that never went is a record that is simply wrong, so it is put back.
 */
import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { authoriseCron } from '@/lib/cronAuth';
import { queueMessage } from '@/lib/comms/send';
import { requirePolicyOwner } from '@/lib/policy/guard';
import { buildPolicyReminderMessage } from '@/lib/policy/invite';
import { mintReminderLink } from '@/lib/policy/reminderLink';

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

/**
 * The wording now lives in src/lib/policy/invite.ts, beside the invitation
 * it chases, and is shared with the owner's per-member Remind button.
 *
 * It was private to this file, which was fine while the scheduled job was
 * the only caller. A second copy written for a button is how a committee
 * starts receiving two differently-worded reminders about one review -- and
 * the one a member reads would depend on whether a cron or a person sent it.
 *
 * The builder also addresses them properly ("Dear Prof. Okeke") and
 * acknowledges sections already answered, neither of which this knew how to
 * do: it opened "Dear <whole name as typed>" and told somebody who had
 * answered seven sections that nothing had been received.
 */
function reminderBody(opts: {
  name: string;
  policyTitle: string | null;
  closesAt: Date;
  window: Window;
  hoursLeft: number;
  answered?: number;
  totalSections?: number;
  url?: string | null;
}): string {
  return buildPolicyReminderMessage({
    inviteeName: opts.name,
    policyTitle: opts.policyTitle,
    closesAt: opts.closesAt,
    answered: opts.answered ?? 0,
    totalSections: opts.totalSections ?? 0,
    url: opts.url ?? null,
  });
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
    // Still no tokenHash here. The link comes from mintReminderLink(), which
    // reads and writes it inside one helper; selecting a hash into this scope
    // would only put it in reach of a log line.
  });

  // How far each has got, so the chase can acknowledge work already done.
  // Telling somebody who has answered seven sections that nothing has been
  // received reads as though it was not noticed, and is the quickest way to
  // lose them for the rest of the round.
  const answeredRows = await prisma.policySectionResponse.groupBy({
    by: ['invitationId'],
    where: { roundId },
    _count: { _all: true },
  });
  const answeredBy = new Map<string, number>(
    answeredRows.map((a) => [a.invitationId, a._count._all]),
  );
  const totalSections = await prisma.policySection.count({
    where: { document: { rounds: { some: { id: roundId } } } },
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

    // A link they can tap, with the one they already hold left working. If
    // minting fails -- the row went while this loop was running -- the chase
    // still goes out, pointing at the link they have, rather than being
    // dropped for want of a URL.
    const minted = await mintReminderLink(invitee.id);

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
        answered: answeredBy.get(invitee.id) ?? 0,
        totalSections,
        url: minted?.url ?? null,
      }),
      // Still OPERATIONAL: no patient is named. The body now carries a
      // credential, but the three values this field takes classify PATIENT
      // data, and inventing a fourth here would mean a value the send policy
      // does not know how to weigh.
      sensitivity: 'OPERATIONAL',
      relatedType: 'POLICY_REVIEW_ROUND',
      relatedId: round.id,
      trigger: 'policy-review-reminder',
      // The window is part of the identity, so the 48-hour and 12-hour chases
      // are different messages and neither suppresses the other.
      scope: `${round.id}:${invitee.id}:${window}`,
      createdByName: actorName ?? 'Scheduled reminder',
    });

    if (result.queued) {
      queued += 1;
    } else {
      skipped += 1;
      // Nothing was sent, so the link was rotated for nothing. Harmless --
      // the previous one still works -- but the record should say what is
      // true, and a suppressed duplicate must not consume a token every time
      // the cron runs.
      if (minted) await minted.rollback();
    }

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
