// ============================================================
// The one path out of ORM
// ------------------------------------------------------------
// Every automated message passes through here. No module sends for itself —
// otherwise the kill switch is a lie, the audit trail has holes, and a rule that
// misfires cannot be stopped in one place.
//
// This phase delivers through channels that ALREADY WORK and cost nothing:
// in-app notifications, FCM push, and the radio. Email and WhatsApp attach to the
// same queue later without changing a caller.
// ============================================================

import prisma from '@/lib/prisma';
import {
  checkSendAllowed, renderTemplate, idempotencyKeyFor,
  type CommChannel, type CommPriority, type CommSensitivity,
} from './policy';

export interface QueueMessageInput {
  channel: CommChannel;
  priority?: CommPriority;

  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientAddress?: string | null;
  recipientIsStaff?: boolean;

  /** A stored template, or a body supplied directly for a manual send. */
  templateCode?: string | null;
  body?: string;
  subject?: string | null;
  sensitivity?: CommSensitivity;
  variables?: Record<string, string | number | null | undefined>;

  /** What this is about, so a message traces back to its cause. */
  relatedType?: string | null;
  relatedId?: string | null;

  /** Identity of the message, for deduplication. */
  trigger: string;
  scope: string;
  ruleId?: string | null;
  escalationLevel?: number | null;

  expiresAt?: Date | null;
  createdById?: string | null;
  createdByName?: string | null;
}

export interface QueueResult {
  queued: boolean;
  messageId?: string;
  /** Set when an identical message was already queued — not an error. */
  duplicate?: boolean;
  reason?: string;
}

/**
 * Is automated communication switched off?
 *
 * Read per call rather than cached: the whole value of a kill switch is that it
 * takes effect NOW, and a five-minute cache is five minutes of messages nobody
 * wanted.
 */
async function killSwitch(): Promise<{ all: boolean; channels: CommChannel[] }> {
  // Env first, so the switch works even if the database is the thing misbehaving.
  if (process.env.COMMUNICATION_DISABLED === 'true') {
    return { all: true, channels: [] };
  }
  const disabled = (process.env.COMMUNICATION_DISABLED_CHANNELS ?? '')
    .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean) as CommChannel[];
  return { all: false, channels: disabled };
}

/**
 * Queue a message. Never throws, never blocks the caller's transaction.
 *
 * A refused message is still RECORDED, with the reason. A communication that was
 * withheld is as much a fact as one that was sent, and losing it means nobody can
 * answer "why did the technician never hear about this".
 */
export async function queueMessage(input: QueueMessageInput): Promise<QueueResult> {
  try {
    const recipientKey = input.recipientUserId ?? input.recipientAddress ?? 'unknown';
    const idempotencyKey = idempotencyKeyFor({
      trigger: input.trigger,
      ruleId: input.ruleId ?? null,
      recipient: recipientKey,
      channel: input.channel,
      scope: input.scope,
      escalationLevel: input.escalationLevel ?? null,
    });

    // Already queued? Not an error — a cron re-running or an offline queue
    // replaying is the normal case, and the unique index is what makes it safe.
    const existing = await prisma.communicationMessage.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) return { queued: false, duplicate: true, messageId: existing.id };

    // Resolve the template. The stored one wins over a supplied body, so a rule
    // cannot quietly bypass the sensitivity classification by inlining text.
    let body = input.body ?? '';
    let subject = input.subject ?? null;
    let sensitivity: CommSensitivity = input.sensitivity ?? 'OPERATIONAL';
    let providerApproved: boolean | undefined;

    if (input.templateCode) {
      const tpl = await prisma.communicationTemplate.findFirst({
        where: { code: input.templateCode, channel: input.channel, isActive: true },
        orderBy: { version: 'desc' },
        select: { body: true, subject: true, sensitivity: true, providerStatus: true },
      });
      if (!tpl) {
        return { queued: false, reason: `No active ${input.channel} template "${input.templateCode}".` };
      }
      body = tpl.body;
      subject = tpl.subject;
      sensitivity = tpl.sensitivity as CommSensitivity;
      providerApproved = tpl.providerStatus ? tpl.providerStatus === 'APPROVED' : undefined;
    }

    const rendered = renderTemplate(body, input.variables ?? {});
    if (rendered.missing.length) {
      // Refused rather than sent with holes. A message reading "Theatre {{name}}
      // is not ready" tells a person the system is broken; one reading
      // "Theatre  is not ready" tells them nothing and gets ignored.
      return {
        queued: false,
        reason: `Template is missing: ${rendered.missing.join(', ')}.`,
      };
    }

    const decision = checkSendAllowed({
      channel: input.channel,
      sensitivity,
      priority: input.priority,
      recipientIsStaff: input.recipientIsStaff ?? Boolean(input.recipientUserId),
      recipientAddress: input.recipientAddress,
      killSwitch: await killSwitch(),
      providerApproved,
      expiresAt: input.expiresAt ?? null,
    });

    const message = await prisma.communicationMessage.create({
      data: {
        channel: input.channel as never,
        priority: (input.priority ?? 'NORMAL') as never,
        // Recorded either way — a withheld message is a fact worth keeping.
        status: decision.allowed ? 'QUEUED' : (decision.expired ? 'EXPIRED' : 'CANCELLED') as never,
        failureReason: decision.allowed ? null : decision.reason ?? null,
        recipientUserId: input.recipientUserId ?? null,
        recipientName: input.recipientName ?? null,
        recipientAddress: input.recipientAddress ?? null,
        templateCode: input.templateCode ?? null,
        renderedSubject: subject,
        renderedBody: rendered.body,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        ruleId: input.ruleId ?? null,
        escalationLevel: input.escalationLevel ?? null,
        idempotencyKey,
        expiresAt: input.expiresAt ?? null,
        createdById: input.createdById ?? null,
        createdByName: input.createdByName ?? null,
      },
      select: { id: true },
    });

    if (!decision.allowed) {
      return { queued: false, messageId: message.id, reason: decision.reason };
    }

    // Internal channels deliver immediately: they are local writes, not network
    // calls, so there is nothing to gain by deferring them and a delay in an
    // emergency alert is the one thing this must not add.
    await deliverInternal(message.id, input, rendered.body, subject);

    return { queued: true, messageId: message.id };
  } catch (err) {
    // Never propagates. The clinical action that triggered this must not fail
    // because a notification could not be recorded.
    console.error('[comms] could not queue message', input.trigger, err);
    return { queued: false, reason: 'Internal error queueing the message.' };
  }
}

/**
 * Deliver on a channel ORM already owns.
 *
 * Email and WhatsApp will be handled by a cloud-side worker reading QUEUED rows,
 * which is why this only touches the three that need no provider.
 */
async function deliverInternal(
  messageId: string,
  input: QueueMessageInput,
  body: string,
  subject: string | null
): Promise<void> {
  try {
    if (input.channel === 'IN_APP' && input.recipientUserId) {
      await prisma.notification.create({
        data: {
          userId: input.recipientUserId,
          title: subject ?? input.trigger.replace(/_/g, ' '),
          message: body,
          type: 'SYSTEM' as never,
        },
      });
    } else if (input.channel === 'RADIO') {
      await prisma.radioAnnouncement.create({
        data: {
          category: 'WORKFLOW',
          title: subject ?? input.trigger.replace(/_/g, ' '),
          message: body,
          // Below an emergency at 100, above music. An operational alert must
          // never talk over a critical announcement.
          priority: input.priority === 'CRITICAL' ? 95 : 70,
          urgency: input.priority === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM',
          triggerSource: 'EVENT',
        },
      });
    } else if (input.channel !== 'PUSH') {
      // EMAIL / WHATSAPP / SMS stay QUEUED for the cloud worker.
      return;
    }

    await prisma.communicationMessage.update({
      where: { id: messageId },
      data: { status: 'SENT' as never, sentAt: new Date() },
    });
  } catch (err) {
    console.error('[comms] delivery failed', messageId, err);
    await prisma.communicationMessage.update({
      where: { id: messageId },
      data: {
        status: 'FAILED' as never,
        failureReason: err instanceof Error ? err.message.slice(0, 500) : 'Delivery failed',
        attempts: { increment: 1 },
      },
    }).catch(() => { /* the original error is what matters */ });
  }
}
