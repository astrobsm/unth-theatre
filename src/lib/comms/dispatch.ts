// ============================================================
// The thing that actually sends
// ------------------------------------------------------------
// comms/whatsapp.ts has been a complete Meta Cloud API client for months and
// nothing has ever called it. queueMessage() writes QUEUED rows and nothing
// reads them. Every message this hospital believes it has sent went to the
// in-app bell and web push, which is precisely why staff do not look at their
// blockers: nothing ever reached them where they actually are.
//
// This is the missing half. It claims queued rows, hands them to the provider,
// and records what happened.
//
// WHERE IT RUNS, and why that matters. The cloud, only. communication_messages
// is deliberately NOT replicated between the nodes, and that is the right
// decision here rather than an oversight to fix: two databases holding the same
// queued row would each dispatch it, and the idempotency key cannot prevent
// that because it is unique per database. One sender, on the node that always
// has the internet.
//
// DRY RUN IS THE DEFAULT, and stays the default until somebody sets
// credentials. A half-configured integration that sends real messages to real
// consultants at 6 p.m. is worse than one that sends none, so absence of
// configuration means "write down exactly what you would have sent", never
// "try it and see".
// ============================================================

import prisma from '@/lib/prisma';
import {
  sendTemplate, whatsappConfig, toWhatsAppNumber, deepLinkSuffix,
  type WhatsAppConfig, type WhatsAppSendResult,
} from './whatsapp';

/**
 * How many to take in one run.
 *
 * Meta's published throughput is far above this; the limit here is the
 * function's own execution budget, and a run that times out half way leaves
 * rows in SENDING with no-one to rescue them. Small and frequent beats large
 * and occasional.
 */
export const DISPATCH_BATCH = 40;

/**
 * Attempts before a message is left alone.
 *
 * Only retryable failures get here — classifyFailure already sends a wrong
 * number or an unapproved template straight to FAILED, because retrying those
 * costs money and changes nothing.
 */
export const MAX_ATTEMPTS = 4;

/**
 * A message older than this is not worth sending even if it never went.
 *
 * A reminder about yesterday's list arriving tomorrow does not inform anybody;
 * it teaches them that the reminders are noise, which is the state this whole
 * feature exists to escape.
 */
export const STALE_AFTER_HOURS = 12;

export interface DispatchSummary {
  /** True when no credentials are configured and nothing was really sent. */
  dryRun: boolean;
  claimed: number;
  sent: number;
  failed: number;
  expired: number;
  /** Written down in dry run so the wording can be checked before going live. */
  wouldHaveSent: Array<{ to: string; template: string; params: string[]; link: string | null }>;
}

/** Is this deployment allowed to actually send? */
export async function dispatchMode(): Promise<{ live: boolean; reason: string }> {
  if (process.env.COMMS_DRY_RUN === 'true') {
    return { live: false, reason: 'COMMS_DRY_RUN is set in the environment, so nothing is sent.' };
  }
  if (!whatsappConfig()) {
    return {
      live: false,
      reason: 'No WhatsApp credentials are configured, so nothing can be sent yet.',
    };
  }
  // The switch an administrator can reach. Read here as well as in the policy
  // because dry run is about DELIVERY, not about whether the message should
  // have been composed: in dry run the queue still fills, which is what makes
  // the wording reviewable before anybody is messaged.
  try {
    const row = await prisma.communicationSetting.findUnique({
      where: { id: 'singleton' },
      select: { dryRun: true },
    });
    if (row?.dryRun) {
      return { live: false, reason: 'Dry run is switched on in the app, so nothing is sent.' };
    }
  } catch {
    // Unreadable setting is not a reason to start sending.
    return { live: false, reason: 'The messaging settings could not be read, so nothing is sent.' };
  }
  return { live: true, reason: 'Sending is live.' };
}

interface Claimed {
  id: string;
  recipientAddress: string | null;
  recipientUserId: string | null;
  templateCode: string | null;
  renderedBody: string;
  providerParams: unknown;
  relatedType: string | null;
  relatedId: string | null;
  attempts: number;
  queuedAt: Date;
  expiresAt: Date | null;
}

/**
 * Take the next batch and mark it SENDING in the same statement.
 *
 * FOR UPDATE SKIP LOCKED so two overlapping runs cannot both claim a row. Cron
 * schedules overlap in practice — a slow run and the next tick — and without
 * this the same consultant is messaged twice, which is exactly the behaviour
 * that gets an alerting system muted.
 */
async function claim(): Promise<Claimed[]> {
  return prisma.$queryRawUnsafe<Claimed[]>(`
    WITH next AS (
      SELECT id FROM communication_messages
       WHERE status = 'QUEUED' AND channel = 'WHATSAPP'
       ORDER BY "queuedAt"
       LIMIT ${DISPATCH_BATCH}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE communication_messages m
       SET status = 'SENDING', attempts = m.attempts + 1, "sendingSince" = now()
      FROM next
     WHERE m.id = next.id
    RETURNING m.id, m."recipientAddress", m."recipientUserId", m."templateCode",
              m."renderedBody", m."providerParams", m."relatedType", m."relatedId",
              m.attempts, m."queuedAt", m."expiresAt"
  `);
}

async function markSent(id: string, providerMessageId: string | null) {
  await prisma.communicationMessage.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date(), providerMessageId, failureReason: null },
  });
}

async function markFailed(id: string, reason: string) {
  await prisma.communicationMessage.update({
    where: { id },
    data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
  });
}

/** Put it back for another go. */
async function requeue(id: string, reason: string) {
  await prisma.communicationMessage.update({
    where: { id },
    data: { status: 'QUEUED', failureReason: reason.slice(0, 500) },
  });
}

async function markExpired(id: string, reason: string) {
  await prisma.communicationMessage.update({
    where: { id },
    data: { status: 'EXPIRED', failureReason: reason.slice(0, 500) },
  });
}

/**
 * The Meta template name and language for a queued message.
 *
 * Read at SEND time rather than frozen with the rest, because approval is the
 * one property that legitimately changes after queueing: a template submitted
 * on Monday and approved on Tuesday should let Monday's queue go out, not fail
 * it for ever.
 */
async function providerTemplate(code: string | null): Promise<
  { name: string; language: string } | { error: string }
> {
  if (!code) {
    return {
      error: 'No template code. A business-initiated WhatsApp message must name '
        + 'a template Meta has approved; free text is only valid inside a 24-hour reply window.',
    };
  }
  const tpl = await prisma.communicationTemplate.findFirst({
    where: { code, channel: 'WHATSAPP', isActive: true },
    orderBy: { version: 'desc' },
    select: { providerTemplateId: true, providerStatus: true, providerLanguage: true },
  });
  if (!tpl) return { error: `No active WhatsApp template "${code}".` };
  if (!tpl.providerTemplateId) {
    return { error: `Template "${code}" has no Meta template name recorded yet.` };
  }
  if (tpl.providerStatus !== 'APPROVED') {
    return {
      error: `Template "${code}" is ${tpl.providerStatus ?? 'not submitted'} at Meta, not APPROVED.`,
    };
  }
  return { name: tpl.providerTemplateId, language: tpl.providerLanguage ?? 'en' };
}

/** Positional parameters, defensively — a template with none is legitimate. */
function paramsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? '')).filter((v) => v.length > 0);
}

/**
 * Send everything currently queued for WhatsApp.
 *
 * Never throws. A dispatcher that falls over on one bad row stops the queue for
 * everybody, and the whole point of this feature is that the messages arrive.
 */
export async function dispatchWhatsApp(now: Date = new Date()): Promise<DispatchSummary> {
  const mode = await dispatchMode();
  const cfg = mode.live ? whatsappConfig() : null;

  const summary: DispatchSummary = {
    dryRun: !mode.live,
    claimed: 0, sent: 0, failed: 0, expired: 0,
    wouldHaveSent: [],
  };

  let rows: Claimed[];
  try {
    rows = await claim();
  } catch (e) {
    console.error('[comms] could not claim messages', e);
    return summary;
  }
  summary.claimed = rows.length;

  for (const row of rows) {
    try {
      // Too late to matter. Recorded as EXPIRED rather than FAILED: nothing went
      // wrong, the moment simply passed.
      const staleBy = (now.getTime() - row.queuedAt.getTime()) / 3_600_000;
      if (row.expiresAt && row.expiresAt <= now) {
        await markExpired(row.id, 'The moment it referred to had passed.');
        summary.expired += 1;
        continue;
      }
      if (staleBy > STALE_AFTER_HOURS) {
        await markExpired(row.id, `Queued ${Math.round(staleBy)} hours ago and no longer useful.`);
        summary.expired += 1;
        continue;
      }

      const to = toWhatsAppNumber(row.recipientAddress ?? '');
      if (!to) {
        await markFailed(row.id, 'No usable phone number for this recipient.');
        summary.failed += 1;
        continue;
      }

      const tpl = await providerTemplate(row.templateCode);
      if ('error' in tpl) {
        // Not retryable. An unapproved template stays unapproved, and a queue
        // full of rows retrying it hides the one thing somebody must go and do.
        await markFailed(row.id, tpl.error);
        summary.failed += 1;
        continue;
      }

      const params = paramsOf(row.providerParams);
      // Where the button lands. Derived from what the message is about, so it
      // cannot drift from it.
      const suffix = deepLinkSuffix(row.relatedType, row.relatedId);

      if (!cfg) {
        // DRY RUN. Recorded as SENT so the rest of the system behaves exactly as
        // it will in production — digests do not re-send, counts are honest —
        // with the reason saying plainly that nothing left the building.
        await prisma.communicationMessage.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: now,
            failureReason: `DRY RUN — not sent. ${mode.reason}`,
          },
        });
        summary.wouldHaveSent.push({ to, template: tpl.name, params, link: suffix });
        summary.sent += 1;
        continue;
      }

      const res: WhatsAppSendResult = await sendTemplate(
        cfg as WhatsAppConfig, to, tpl.name, tpl.language, params, suffix);

      if (res.ok) {
        await markSent(row.id, res.providerMessageId ?? null);
        summary.sent += 1;
        continue;
      }

      // classifyFailure inside the client already decided whether another go
      // could ever work. Honour it rather than guessing again here.
      if (res.retryable && row.attempts < MAX_ATTEMPTS) {
        await requeue(row.id, `Attempt ${row.attempts} failed: ${res.error ?? 'unknown'}`);
      } else {
        await markFailed(row.id, res.error ?? 'The provider refused the message.');
        summary.failed += 1;
      }
    } catch (e) {
      // One row must never take the batch down with it.
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[comms] dispatch error', row.id, msg);
      try {
        if (row.attempts < MAX_ATTEMPTS) await requeue(row.id, msg);
        else await markFailed(row.id, msg);
      } catch { /* the row stays SENDING and the sweeper below rescues it */ }
    }
  }

  return summary;
}

/**
 * Rescue rows stranded in SENDING.
 *
 * A function killed mid-run — a deploy, a timeout, an out-of-memory — leaves
 * rows claimed and nobody holding them. Without this they are invisible for
 * ever: not queued, so never picked up, and not failed, so never reported.
 *
 * Measured from sendingSince, the moment the row was CLAIMED, and not from
 * queuedAt. A message that waited eleven minutes in a backlog and is in flight
 * right now would look stranded by queuedAt, be requeued underneath the send
 * that is still running, and reach the consultant twice.
 *
 * Ten minutes is far longer than any real send — the provider call is seconds —
 * and far shorter than the window in which a reminder still matters.
 */
export async function rescueStranded(olderThanMinutes = 10): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const res = await prisma.$executeRawUnsafe(`
      UPDATE communication_messages
         SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'FAILED' ELSE 'QUEUED' END,
             "failureReason" = 'Recovered: the sender stopped before this was finished.'
       WHERE status = 'SENDING'
         AND "sendingSince" IS NOT NULL
         AND "sendingSince" < $1
    `, cutoff);
    return Number(res) || 0;
  } catch (e) {
    console.error('[comms] could not rescue stranded messages', e);
    return 0;
  }
}
