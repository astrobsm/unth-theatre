// ============================================================
// What may be sent, to whom, on which channel
// ------------------------------------------------------------
// Pure. No database, no provider, no clock of its own — so the rules can be
// argued about against tests rather than against a running system, and so the
// same decision is reached whether a message is queued by a cron, by a user
// pressing a button, or by an offline queue replaying hours later.
// ============================================================

export type CommChannel = 'IN_APP' | 'PUSH' | 'RADIO' | 'EMAIL' | 'WHATSAPP' | 'SMS';
export type CommSensitivity = 'OPERATIONAL' | 'PATIENT_IDENTIFIED' | 'CLINICAL';
export type CommPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';

/**
 * Channels that leave the hospital's own systems.
 *
 * The distinction matters more than "internal vs external service": a WhatsApp
 * message sits on a personal phone, is backed up to somebody's cloud account,
 * and is forwarded. An in-app notification is read inside an authenticated
 * session and goes nowhere else.
 */
export const EXTERNAL_CHANNELS: CommChannel[] = ['EMAIL', 'WHATSAPP', 'SMS'];

export const isExternal = (c: CommChannel) => EXTERNAL_CHANNELS.includes(c);

export interface SendCheckInput {
  channel: CommChannel;
  sensitivity: CommSensitivity;
  priority?: CommPriority;
  /** A staff member with an ORM account, or someone outside it. */
  recipientIsStaff: boolean;
  /** Recipient's address for the channel — phone or email. */
  recipientAddress?: string | null;
  /** Global or per-channel kill switch state. */
  killSwitch?: { all?: boolean; channels?: CommChannel[] } | null;
  /** Template must be approved by the provider for WhatsApp. */
  providerApproved?: boolean;
  /** When the message stops being worth sending. */
  expiresAt?: Date | null;
  now?: Date;
}

export interface SendCheckResult {
  allowed: boolean;
  /** Why not, in words a person can act on. */
  reason?: string;
  /** Set when the message should be recorded as EXPIRED rather than FAILED. */
  expired?: boolean;
}

/**
 * May this message go out?
 *
 * Returns rather than throws, because a refused message must still be RECORDED —
 * a communication that was withheld is as much a fact as one that was sent, and
 * an exception would lose it.
 */
export function checkSendAllowed(input: SendCheckInput): SendCheckResult {
  const now = input.now ?? new Date();

  // Kill switch first. It exists to stop everything immediately, so nothing may
  // be evaluated ahead of it.
  if (input.killSwitch?.all) {
    return { allowed: false, reason: 'All automated communication is currently disabled.' };
  }
  if (input.killSwitch?.channels?.includes(input.channel)) {
    return { allowed: false, reason: `${input.channel} sending is currently disabled.` };
  }

  // Expiry before anything else that could pass. A reminder for a case that has
  // already started helps nobody and erodes trust in every other alert.
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    return {
      allowed: false,
      expired: true,
      reason: 'No longer worth sending — the moment it referred to has passed.',
    };
  }

  // CLINICAL detail never leaves the app, whoever the recipient is. The message
  // on an external channel says "log in to ORM"; the detail stays behind
  // authentication.
  if (input.sensitivity === 'CLINICAL' && isExternal(input.channel)) {
    return {
      allowed: false,
      reason: 'Clinical detail cannot be sent on an external channel. Use a template that directs the recipient to ORM.',
    };
  }

  // A patient's name may go to staff, never to an outside party such as a
  // vendor — they have no reason to know who the operation is for.
  if (input.sensitivity === 'PATIENT_IDENTIFIED' && isExternal(input.channel) && !input.recipientIsStaff) {
    return {
      allowed: false,
      reason: 'This template names a patient and the recipient is not staff.',
    };
  }

  if (isExternal(input.channel) && !(input.recipientAddress ?? '').trim()) {
    return { allowed: false, reason: 'No address recorded for this recipient on that channel.' };
  }

  // Meta approves WhatsApp templates. An unapproved one is refused by the
  // provider however correct it looks, so it is refused here with a reason a
  // person can act on rather than a provider error nobody reads.
  if (input.channel === 'WHATSAPP' && input.providerApproved === false) {
    return { allowed: false, reason: 'The WhatsApp template has not been approved by the provider.' };
  }

  return { allowed: true };
}

export interface RenderResult {
  body: string;
  /** Variables the template asked for that were not supplied. */
  missing: string[];
}

/**
 * Fill {{variables}} in a template body.
 *
 * An unsupplied variable is reported and left VISIBLE as its placeholder rather
 * than blanked. "Theatre  is not ready" reads as a system fault and gets ignored;
 * "Theatre {{theatreName}} is not ready" is obviously broken and gets fixed.
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>
): RenderResult {
  const missing: string[] = [];
  const out = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v === null || v === undefined || v === '') {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    return String(v);
  });
  return { body: out, missing };
}

/**
 * The key that stops a message being sent twice.
 *
 * Deterministic from what the message IS, so an offline queue replaying, a cron
 * re-running, and two nodes syncing all produce the same key — and the unique
 * index does the rest.
 */
export function idempotencyKeyFor(parts: {
  trigger: string;
  ruleId?: string | null;
  recipient: string;
  channel: CommChannel;
  /** Distinguishes today's reminder from tomorrow's for the same case. */
  scope: string;
  escalationLevel?: number | null;
}): string {
  return [
    parts.trigger,
    parts.ruleId ?? 'manual',
    parts.recipient,
    parts.channel,
    parts.scope,
    parts.escalationLevel ?? 0,
  ].join('|');
}

/** Channels a priority should use when a rule does not say. */
export function defaultChannelsFor(priority: CommPriority): CommChannel[] {
  switch (priority) {
    // Critical reaches people who are not looking at a screen. The radio is
    // included precisely because it does not need anyone to be holding a phone.
    case 'CRITICAL': return ['IN_APP', 'PUSH', 'RADIO'];
    case 'URGENT': return ['IN_APP', 'PUSH'];
    case 'HIGH': return ['IN_APP', 'PUSH'];
    default: return ['IN_APP'];
  }
}
