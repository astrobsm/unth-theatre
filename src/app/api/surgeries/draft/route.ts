import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditChanges } from '@/lib/auditChanges';

export const dynamic = 'force-dynamic';

/**
 * The booking a person has started but not yet made.
 *
 *   GET     what they had reached, so the form can offer to resume it
 *   PUT     save a completed section
 *   DELETE  discard it, or clear it once the booking is actually made
 *
 * Always scoped to the signed-in user. There is no way to ask for somebody
 * else's draft, because a draft holds a patient's name and clinical answers and
 * has none of the review a finished record gets.
 */

/** Sections, in the order they are completed. */
const STEPS = ['patient', 'surgery', 'preop', 'consent', 'packs', 'team', 'review'] as const;
type Step = (typeof STEPS)[number];
const isStep = (v: unknown): v is Step => typeof v === 'string' && (STEPS as readonly string[]).includes(v);

/**
 * A draft is work in progress, not evidence, so it is capped. Without a limit
 * this column is a place to put a base64 consent scan — which is exactly how
 * audit_logs came to hold 43 MB and multi-megabyte rows.
 */
const MAX_DRAFT_BYTES = 256 * 1024;

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const draft = await prisma.surgeryDraft.findUnique({ where: { userId } });
  return NextResponse.json({ draft: draft ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const step: Step = isStep(body.step) ? body.step : 'patient';

  // File payloads are stripped for the same reason as in the audit trail: the
  // consent scan already has somewhere to live, and a draft is saved on every
  // section — so a megabyte here is a megabyte written over and over on a link
  // that is usually the reason the draft exists.
  const data = auditChanges(body.data ?? {});
  const serialised = JSON.stringify(data);
  if (serialised.length > MAX_DRAFT_BYTES) {
    return NextResponse.json(
      { error: 'This booking is too large to save as a draft. Complete it in one go, or remove attachments.' },
      { status: 413 },
    );
  }

  const patientId = typeof body.patientId === 'string' ? body.patientId : null;
  const patientName = typeof body.patientName === 'string' ? body.patientName.slice(0, 200) : null;

  // Upsert on userId: one draft per person, enforced by a unique index rather
  // than by whichever request happens to arrive first.
  const draft = await prisma.surgeryDraft.upsert({
    where: { userId },
    create: { userId, step, data: data as object, patientId, patientName },
    update: { step, data: data as object, patientId, patientName },
  });

  return NextResponse.json(
    { ok: true, step: draft.step, savedAt: draft.updatedAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // deleteMany, not delete: discarding a draft that is already gone is a
  // success, not a 404. This runs right after a booking is made, and a booking
  // must never appear to fail because the tidying up did.
  await prisma.surgeryDraft.deleteMany({ where: { userId } });

  // Sweep anything abandoned a fortnight ago. Cheap, indexed, and it keeps a
  // table nobody looks at from growing without bound.
  prisma.surgeryDraft
    .deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
