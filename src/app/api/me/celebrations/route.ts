// ============================================================
// A colleague telling us which days they want celebrated
// ------------------------------------------------------------
//   GET    -> { ask, prefsSetAt, celebrations }
//   POST   -> replace my own list, or decline
//   DELETE -> ?id=... switch one off
//
// SELF-SERVICE, AND NOT BY ACCIDENT. Nobody in theatre management knows when
// the porters' birthdays are, and the HR record would not cover the two thirds
// of these days that are not birthdays. The person is the only source.
//
// IT IS ALSO CONSENT. Entering a day is how somebody says "yes, I would like
// this mentioned". Declining is recorded with exactly the same weight, and a
// colleague who declines is never asked again — which is why the prompt writes
// celebrationPrefsSetAt in both cases.
//
// NOBODY MAY WRITE ANYBODY ELSE'S DAYS HERE. The user id comes from the
// session and from nowhere else: no id is read from the body, so there is no
// parameter to tamper with.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const KINDS = ['BIRTHDAY', 'WEDDING_ANNIVERSARY', 'WORK_ANNIVERSARY', 'OTHER'] as const;

/** Days in a month, with February allowed its 29th. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const entry = z.object({
  kind: z.enum(KINDS),
  label: z.string().trim().max(60).optional().nullable(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  sinceYear: z.number().int().min(1900).max(2200).optional().nullable(),
});

const schema = z.object({
  /** The whole list, as the person wants it to stand. */
  entries: z.array(entry).max(12).optional(),
  /** "I would rather not be celebrated." Recorded, and respected. */
  decline: z.boolean().optional(),
});

type Entry = z.infer<typeof entry>;

async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ?? null;
}

/**
 * What this person has told us, and whether they still need asking.
 *
 * Drives the one-time prompt on the dashboard, so it must be cheap and must
 * never throw: a dashboard that will not load because the birthday table is
 * unhappy is a far worse outcome than a prompt that does not appear.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ask: false, celebrations: [] });

  try {
    const [user, rows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { celebrationPrefsSetAt: true, status: true },
      }),
      prisma.staffCelebration.findMany({
        where: { userId, active: true },
        orderBy: [{ month: 'asc' }, { day: 'asc' }],
        select: {
          id: true, kind: true, label: true, month: true, day: true, sinceYear: true,
        },
      }),
    ]);

    return NextResponse.json({
      // Asked once, of people whose account is actually in use. A pending
      // account is somebody who cannot sign in yet.
      ask: Boolean(user && user.status === 'APPROVED' && !user.celebrationPrefsSetAt),
      prefsSetAt: user?.celebrationPrefsSetAt ?? null,
      celebrations: rows,
    });
  } catch {
    return NextResponse.json({ ask: false, celebrations: [] });
  }
}

/** Is this a day that exists? 31 February is somebody's typo, not a birthday. */
function realDay(month: number, day: number): boolean {
  return day >= 1 && day <= (DAYS_IN_MONTH[month - 1] ?? 31);
}

/** A sensible label, and OTHER must have one — "A Special Day" celebrates nothing. */
function labelFor(e: Entry): string | null {
  const given = (e.label ?? '').trim();
  if (e.kind !== 'OTHER') return null;
  return given || null;
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check the days entered and try again.' },
      { status: 400 },
    );
  }

  const now = new Date();

  // Declining is a complete answer. The flag is set so the prompt never comes
  // back, and any days already entered are switched off rather than left
  // where a board would read them.
  if (parsed.data.decline) {
    await prisma.$transaction([
      prisma.staffCelebration.updateMany({ where: { userId }, data: { active: false } }),
      prisma.user.update({ where: { id: userId }, data: { celebrationPrefsSetAt: now } }),
    ]);
    return NextResponse.json({
      ok: true,
      declined: true,
      celebrations: [],
      message: 'Noted — we will not mark personal days for you. '
        + 'You can change that any time from Settings.',
    });
  }

  const entries = parsed.data.entries ?? [];

  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (!realDay(e.month, e.day)) {
      return NextResponse.json(
        { error: 'That date does not exist. Please check the day and month.' },
        { status: 400 },
      );
    }
    if (e.kind === 'OTHER' && !labelFor(e)) {
      return NextResponse.json(
        { error: 'Give the occasion a name, so we know what we are celebrating.' },
        { status: 400 },
      );
    }
    // A birth YEAR is an age, and an age is not the hospital's business. The
    // field is simply dropped rather than refused, so a client that sends one
    // does not fail the whole save.
    if (e.kind === 'BIRTHDAY') e.sinceYear = null;
    if (e.sinceYear && e.sinceYear > now.getUTCFullYear()) {
      return NextResponse.json(
        { error: 'That year is in the future. Please check it.' },
        { status: 400 },
      );
    }
  }

  // Deduplicate on the same key the unique index uses, keeping the last one
  // the person typed: two rows differing only in label would otherwise be
  // rejected by the database with a message nobody could act on.
  const seen: Record<string, Entry> = {};
  const order: string[] = [];
  entries.forEach((e) => {
    const key = `${e.kind}|${e.month}|${e.day}`;
    if (!(key in seen)) order.push(key);
    seen[key] = e;
  });
  const wanted = order.map((k) => seen[k]);

  try {
    // Replace the whole list: the client sends the state it wants, which is
    // far easier to reason about than a patch, and the person is editing a
    // short list in front of them.
    await prisma.$transaction([
      prisma.staffCelebration.updateMany({ where: { userId }, data: { active: false } }),
      ...wanted.map((e) => prisma.staffCelebration.upsert({
        where: {
          userId_kind_month_day: {
            userId, kind: e.kind, month: e.month, day: e.day,
          },
        },
        create: {
          userId,
          kind: e.kind,
          label: labelFor(e),
          month: e.month,
          day: e.day,
          sinceYear: e.sinceYear ?? null,
          active: true,
        },
        update: {
          label: labelFor(e),
          sinceYear: e.sinceYear ?? null,
          active: true,
        },
      })),
      prisma.user.update({ where: { id: userId }, data: { celebrationPrefsSetAt: now } }),
    ]);
  } catch {
    return NextResponse.json(
      { error: 'Could not save that just now. Please try again.' },
      { status: 500 },
    );
  }

  const rows = await prisma.staffCelebration.findMany({
    where: { userId, active: true },
    orderBy: [{ month: 'asc' }, { day: 'asc' }],
    select: { id: true, kind: true, label: true, month: true, day: true, sinceYear: true },
  });

  return NextResponse.json({
    ok: true,
    celebrations: rows,
    message: rows.length
      ? 'Thank you — saved. We will mark the day.'
      : 'Saved. No personal days are recorded for you.',
  });
}

/** Switch one day off. Scoped to the signed-in person's own rows. */
export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Which day?' }, { status: 400 });

  // updateMany with userId in the filter, not update by id: a delete that
  // matches nothing is the correct outcome for somebody else's row.
  const res = await prisma.staffCelebration.updateMany({
    where: { id, userId },
    data: { active: false },
  });
  if (res.count === 0) return NextResponse.json({ error: 'No such day.' }, { status: 404 });

  return NextResponse.json({ ok: true, message: 'Removed.' });
}
