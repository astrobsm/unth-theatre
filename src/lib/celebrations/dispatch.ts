// ============================================================
// Working out who a greeting goes to, and sending it
// ------------------------------------------------------------
// Shared by the board (which counts) and the send route (which sends), so that
// the number on the screen and the number of messages that leave cannot drift
// apart.
//
// EVERY GREETING IS ADDRESSED TO ONE PERSON. There is no broadcast here and
// there is not going to be one: a circular to two hundred people reads as a
// circular, and the point of this feature is that it does not.
//
// SENT IN BATCHES, ON PURPOSE. Six hundred staff is six hundred message rows
// and six hundred notification rows; attempted in one request it exceeds the
// serverless time limit, fails halfway, and leaves nobody able to say who was
// greeted. The screen asks for a batch at a time and the route reports what is
// left, so a half-finished send is a resumable fact rather than a mystery.
//
// AND IT IS SENT ONCE. Dedupe is on the day, not on the occasion: a colleague
// who has already been wished a happy new month on the 1st of October must not
// also receive an Independence Day message, because two greetings in one
// morning is how a person learns they are on a mailing list. Their own
// birthday is exempt — that is a different kind of message and it is theirs.
// ============================================================

import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { occasionReachesRole, type Occasion } from './calendar';
import {
  buildCelebrationMessage,
  buildPersonalCelebrationMessage,
  personalTitle,
  type PersonalKind,
} from './messages';

/** Notification types. Kept apart so the two dedupe rules do not collide. */
export const OCCASION_TYPE = 'CELEBRATION_OCCASION';
export const PERSONAL_TYPE = 'CELEBRATION_PERSONAL';

/**
 * How many people one request greets.
 *
 * Sixty is about four seconds of database work and leaves generous headroom
 * under the platform's limit; the screen simply asks again until nothing is
 * left.
 */
export const SEND_BATCH = 60;

const BASE = '/dashboard/celebrations';

/** Every calendar greeting sent for one day shares this prefix. */
export const dayPrefix = (date: string) => `${BASE}?on=${date}&`;

export const occasionLink = (date: string, key: string) => `${dayPrefix(date)}occasion=${key}`;

export const personalLink = (date: string, celebrationId: string) =>
  `${BASE}?on=${date}&personal=${celebrationId}`;

export interface Recipient {
  id: string;
  fullName: string;
  role: string | null;
  phoneNumber: string | null;
}

/**
 * Accounts that are not members of staff.
 *
 * Supplier logins hold a role in the same enum as everybody else, and a
 * "thank you for your service to humanity" to a consumable vendor would be
 * both odd and slightly insulting to the people it is meant for.
 */
const NON_STAFF_ROLES = ['CONSUMABLE_PACK_PROVIDER', 'SCRUB_CARE_PROVIDER'];

/** Everybody a greeting could reach, in a stable order. */
export async function staffList(roles?: readonly string[]): Promise<Recipient[]> {
  const rows = await prisma.user.findMany({
    where: {
      status: 'APPROVED',
      // Supplier accounts are scoped to a vendor; theatre staff never are.
      vendorId: null,
      ...(roles && roles.length
        ? { role: { in: roles as never } }
        : { role: { notIn: NON_STAFF_ROLES as never } }),
    },
    orderBy: [{ fullName: 'asc' }],
    select: { id: true, fullName: true, role: true, phoneNumber: true },
  });
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    role: r.role ? String(r.role) : null,
    phoneNumber: r.phoneNumber ?? null,
  }));
}

/** Who this occasion is for. */
export async function recipientsFor(o: Occasion): Promise<Recipient[]> {
  const list = await staffList(o.audience === 'ROLES' ? (o.roles ?? []) : undefined);
  // Belt and braces: the role filter is in the query, and checked again here,
  // because a professional day reaching the wrong cadre is the one failure
  // nobody would forgive.
  return list.filter((r) => occasionReachesRole(o, r.role));
}

/** Who has already had a calendar greeting for this day, whatever the occasion. */
export async function greetedOn(date: string): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: { type: OCCASION_TYPE, link: { startsWith: dayPrefix(date) } },
    select: { userId: true },
  });
  const out = new Set<string>();
  rows.forEach((r) => out.add(r.userId));
  return out;
}

/** Who has already had this particular personal day marked. */
export async function personalSent(date: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const links = ids.map((id) => personalLink(date, id));
  const rows = await prisma.notification.findMany({
    where: { type: PERSONAL_TYPE, link: { in: links } },
    select: { link: true },
  });
  const out = new Set<string>();
  rows.forEach((r) => {
    const id = (r.link ?? '').split('personal=')[1];
    if (id) out.add(id);
  });
  return out;
}

export interface SendOutcome {
  /** How many people were written to by this call. */
  sent: number;
  /** Still waiting, after this batch. */
  remaining: number;
  /** Reached on WhatsApp as well as in the app. */
  whatsappQueued: number;
  /** Named, so "nothing happened" is never the whole answer. */
  skipped: { name: string; reason: string }[];
  /** A sample of what went out, for the screen to show back. */
  sample: string | null;
}

interface Actor {
  id?: string | null;
  name?: string | null;
}

/**
 * Write to one person and record it.
 *
 * The notification row is the fact that it was sent: it is written whatever
 * WhatsApp did, because a colleague with no number on file must still be
 * greeted inside the app, and because the board reads these rows to know who
 * is left.
 */
async function deliver(input: {
  person: Recipient;
  title: string;
  text: string;
  type: string;
  link: string;
  scope: string;
  actor: Actor;
}): Promise<{ whatsapp: boolean }> {
  const wa = input.person.phoneNumber ? toWhatsAppNumber(input.person.phoneNumber) : null;

  const queued = await queueMessage({
    channel: 'WHATSAPP' as never,
    // A greeting must never push aside a message about a patient.
    priority: 'LOW' as never,
    recipientUserId: input.person.id,
    recipientName: input.person.fullName,
    recipientAddress: wa,
    recipientIsStaff: true,
    body: input.text,
    relatedType: 'USER',
    relatedId: input.person.id,
    trigger: input.type,
    scope: input.scope,
    createdById: input.actor.id ?? null,
    createdByName: input.actor.name ?? 'Theatre Management',
  });

  await prisma.notification.create({
    data: {
      userId: input.person.id,
      type: input.type,
      title: input.title,
      message: input.text,
      link: input.link,
    },
  });

  return { whatsapp: queued.queued === true };
}

/**
 * Send a calendar occasion to the people it is for.
 *
 * `personIds` narrows it to a chosen few — used by the screen's "send to this
 * person" button, and by the batching loop. Left out, it takes the next batch
 * of everybody who has not been greeted today.
 */
export async function sendOccasion(input: {
  occasion: Occasion;
  note?: string | null;
  actor: Actor;
  personIds?: readonly string[];
  limit?: number;
}): Promise<SendOutcome> {
  const all = await recipientsFor(input.occasion);
  const already = await greetedOn(input.occasion.date);

  const chosen = input.personIds && input.personIds.length
    ? all.filter((p) => input.personIds!.indexOf(p.id) !== -1)
    : all;

  const outstanding = chosen.filter((p) => !already.has(p.id));
  const batch = outstanding.slice(0, input.limit ?? SEND_BATCH);

  const skipped: { name: string; reason: string }[] = [];
  let whatsappQueued = 0;
  let sample: string | null = null;

  for (let i = 0; i < batch.length; i += 1) {
    const person = batch[i];
    const text = buildCelebrationMessage({
      occasion: input.occasion,
      personName: person.fullName,
      role: person.role,
      note: input.note ?? null,
    });
    if (!sample) sample = text;
    try {
      const r = await deliver({
        person,
        title: input.occasion.title,
        text,
        type: OCCASION_TYPE,
        link: occasionLink(input.occasion.date, input.occasion.key),
        scope: `${input.occasion.key}:${input.occasion.date}`,
        actor: input.actor,
      });
      if (r.whatsapp) whatsappQueued += 1;
      else if (!person.phoneNumber) {
        skipped.push({ name: person.fullName, reason: 'No phone number on file — sent in the app only.' });
      }
    } catch {
      skipped.push({ name: person.fullName, reason: 'Could not be written to; try again.' });
    }
  }

  const sentIds = new Set<string>();
  batch.forEach((p) => sentIds.add(p.id));

  return {
    sent: batch.length - skipped.filter((s) => s.reason.startsWith('Could not')).length,
    remaining: Math.max(0, outstanding.length - batch.length),
    whatsappQueued,
    skipped,
    sample,
  };
}

/** Send one person's own day. */
export async function sendPersonal(input: {
  celebrationId: string;
  /** The day it falls on this year. */
  date: string;
  note?: string | null;
  actor: Actor;
}): Promise<{ ok: boolean; error?: string; outcome?: SendOutcome; personName?: string }> {
  const row = await prisma.staffCelebration.findUnique({
    where: { id: input.celebrationId },
    select: {
      id: true, kind: true, label: true, sinceYear: true, active: true,
      user: { select: { id: true, fullName: true, role: true, phoneNumber: true, status: true } },
    },
  });
  if (!row || !row.active) return { ok: false, error: 'That day is no longer recorded.' };
  if (row.user.status !== 'APPROVED') {
    return { ok: false, error: `${row.user.fullName}'s account is not active.` };
  }

  const done = await personalSent(input.date, [row.id]);
  if (done.has(row.id)) {
    return {
      ok: false,
      error: `${row.user.fullName} has already been written to about this day. `
        + 'Nothing was sent again.',
    };
  }

  const person: Recipient = {
    id: row.user.id,
    fullName: row.user.fullName,
    role: row.user.role ? String(row.user.role) : null,
    phoneNumber: row.user.phoneNumber ?? null,
  };
  const kind = row.kind as PersonalKind;
  const text = buildPersonalCelebrationMessage({
    kind,
    label: row.label,
    date: input.date,
    personName: person.fullName,
    role: person.role,
    sinceYear: row.sinceYear,
    note: input.note ?? null,
  });

  const r = await deliver({
    person,
    title: personalTitle(kind, row.label),
    text,
    type: PERSONAL_TYPE,
    link: personalLink(input.date, row.id),
    scope: `personal:${row.id}:${input.date}`,
    actor: input.actor,
  });

  return {
    ok: true,
    personName: person.fullName,
    outcome: {
      sent: 1,
      remaining: 0,
      whatsappQueued: r.whatsapp ? 1 : 0,
      skipped: r.whatsapp || person.phoneNumber
        ? []
        : [{ name: person.fullName, reason: 'No phone number on file — sent in the app only.' }],
      sample: text,
    },
  };
}
