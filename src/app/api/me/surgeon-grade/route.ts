import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * A surgeon telling us their grade, once.
 *
 * 194 of the 196 surgeons on this system sat under the undifferentiated
 * SURGEON role and only 2 under CONSULTANT_SURGEON, so the schedule could not
 * show who was supervising whom and the booking screen could not offer a
 * sensible list of supervising consultants. Asking the person is the only
 * source of truth we have.
 *
 * ---------------------------------------------------------------------------
 * This endpoint changes a role, so it is deliberately narrow:
 *
 *  - Only somebody ALREADY holding a surgical role may use it. A nurse or a
 *    porter cannot call this and become a consultant surgeon; the answer only
 *    ever moves a user between the two surgical grades.
 *  - Every declaration is written to the audit log with the previous role, so
 *    a claim to be a consultant is attributable rather than silent.
 *
 * Worth knowing: CONSULTANT_SURGEON and SURGEON are treated identically
 * everywhere in this codebase EXCEPT Theatre Performance (management figures),
 * which consultants may see and residents may not. That is the whole privilege
 * difference, and it is why the audit row exists.
 * ---------------------------------------------------------------------------
 */

const GRADE_TO_ROLE = {
  CONSULTANT: 'CONSULTANT_SURGEON',
  RESIDENT: 'SURGEON',
} as const;

/** The roles this endpoint is allowed to read from and write to. */
const SURGICAL_ROLES = new Set<string>(['SURGEON', 'CONSULTANT_SURGEON']);

const schema = z.object({
  grade: z.enum(['CONSULTANT', 'RESIDENT']),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const sessionUser = session.user as { id?: string; role?: string };
  const userId = sessionUser.id;
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose consultant or resident.' }, { status: 400 });
  }

  // Read the role from the DATABASE, not the session token. A JWT is minutes
  // to hours stale, and this is the check that stops the endpoint being a way
  // into a surgical role from outside one.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, fullName: true },
  });
  if (!existing) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  if (!SURGICAL_ROLES.has(existing.role)) {
    return NextResponse.json(
      { error: 'This only applies to surgeons.' },
      { status: 403 },
    );
  }

  const nextRole = GRADE_TO_ROLE[parsed.data.grade];
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole as never, surgeonGradeConfirmedAt: now },
  });

  // Attributable, because a consultant claim opens Theatre Performance.
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SURGEON_GRADE_DECLARED',
        tableName: 'users',
        recordId: userId,
        changes: JSON.stringify({
          declaredGrade: parsed.data.grade,
          previousRole: existing.role,
          newRole: nextRole,
          declaredBy: 'self',
        }),
        ipAddress:
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          req.headers.get('x-real-ip') ??
          null,
      },
    });
  } catch {
    // The grade is the thing that matters; a failed audit write must not send
    // the surgeon back round the prompt again.
  }

  return NextResponse.json({
    ok: true,
    role: nextRole,
    // The session still carries the old role until it refreshes, so the client
    // is told to do that rather than left showing a stale menu.
    refreshSession: existing.role !== nextRole,
    message:
      parsed.data.grade === 'CONSULTANT'
        ? 'Thank you — recorded as a consultant surgeon.'
        : 'Thank you — recorded as a resident surgeon.',
  });
}

/** Whether this person should be asked. Drives the prompt on the dashboard. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ ask: false });
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ ask: false });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, surgeonGradeConfirmedAt: true },
  });

  return NextResponse.json({
    ask: Boolean(user && SURGICAL_ROLES.has(user.role) && !user.surgeonGradeConfirmedAt),
    currentRole: user?.role ?? null,
  });
}
