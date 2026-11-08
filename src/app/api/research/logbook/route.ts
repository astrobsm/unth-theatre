// ============================================================
// The training log book
// ------------------------------------------------------------
//   GET            the people a book can be built for, and the college profiles
//   POST {...}     the book itself
//
// THE ONE EXPORT IN THIS APPLICATION THAT CARRIES HOSPITAL NUMBERS. The
// College asks for them so an entry can be checked against the folder, and an
// entry that cannot be checked is worth nothing to a trainee. Everything else
// in the research module is anonymised and must stay that way.
//
// So: your own book is always yours to generate; somebody else's needs a
// training or management role; the patient's NAME is off unless asked for;
// and every generation is audited with who asked and about whom.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { LOGBOOK_INCLUDE } from '@/lib/logbook/include';
import { mayGenerateFor } from '@/lib/logbook/access';
import { participationWhere } from '@/lib/logbook/participation';
import {
  buildLogbookRows, quotaProgress, logbookSummary, categoriseForNpmcn,
} from '@/lib/logbook/build';
import {
  NPMCN_SUBSPECIALTIES, NPMCN_NEUROSURGERY_COURSES,
} from '@/lib/logbook/npmcn';
import { COLLEGE_PROFILES, collegeProfile, PARTICIPATION_LEVELS } from '@/lib/logbook/colleges';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const actor = session.user as { id?: string; role?: string };

  // Only you. A picker listing every surgeon in the hospital would invite the
  // question this restriction exists to answer, and the refusal would then
  // arrive after the name had been chosen.
  const me = actor.id
    ? await prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, fullName: true, role: true },
    })
    : null;
  const people = me ? [me] : [];

  return NextResponse.json({
    me: { id: actor.id ?? null, role: actor.role ?? null },
    // Stated plainly so the screen can explain itself rather than just
    // showing one name and leaving the reader to wonder.
    ownCasesOnly: true,
    people,
    colleges: COLLEGE_PROFILES.map((p) => ({
      key: p.key,
      college: p.college,
      programme: p.programme,
      discipline: p.discipline,
      requirement: p.requirement,
      sourceNote: p.sourceNote,
      quotasVerified: p.quotasVerified,
      totalRequired: p.totalRequired,
      columns: p.columns,
      quotas: p.quotas.map((q) => ({ key: q.key, label: q.label, required: q.required })),
      attestation: p.attestation,
      levels: p.levels ?? null,
      guidance: p.guidance ?? null,
      categorised: p.categorised === true,
      patientNameColumn: p.patientNameColumn === true,
    })),
    levels: PARTICIPATION_LEVELS,
    // The NPMCN portfolio is organised by procedure table, and which
    // tables you get depends on your subspecialty.
    npmcnSubspecialties: NPMCN_SUBSPECIALTIES.map((x) => ({ key: x.key, label: x.label })),
    npmcnCourses: NPMCN_NEUROSURGERY_COURSES,
  });
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const actor = session.user as {
    id?: string; role?: string; fullName?: string | null; name?: string | null;
  };

  try {
    const body = await request.json();
    const personId = String(body?.personId ?? '');
    const collegeKey = String(body?.college ?? '');
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');
    const includePatientName = body?.includePatientName === true;

    if (!personId) return NextResponse.json({ error: 'Whose log book?' }, { status: 400 });

    if (!mayGenerateFor(actor.id, actor.role, personId)) {
      return NextResponse.json({
        error: 'A log book is your own record of your own work, and it carries hospital '
          + 'numbers, so you can only generate yours. If you supervise somebody and need '
          + 'their book, ask them for it — that way they know it was taken.',
        code: 'NOT_YOURS',
      }, { status: 403 });
    }

    const profile = collegeProfile(collegeKey);
    if (!profile) {
      return NextResponse.json({ error: 'Which college and programme?' }, { status: 400 });
    }

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, role: true, staffCode: true, staffId: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const where: Record<string, unknown> = { ...participationWhere(personId) };
    if (from || to) {
      if ((from && !isDay(from)) || (to && !isDay(to))) {
        return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
      }
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) range.lte = new Date(`${to}T23:59:59.999Z`);
      where.scheduledDate = range;
    }

    const cases = await prisma.surgery.findMany({
      where: where as never,
      include: LOGBOOK_INCLUDE as never,
      orderBy: { scheduledDate: 'asc' },
    });

    // The College's own form decides the default for the name column: NPMCN
    // prints "Patient's Names" as column two, so withholding it there would
    // hand back a book that does not match the one being transcribed into.
    const wantNames = body?.includePatientName === undefined
      ? profile.patientNameColumn === true
      : includePatientName;

    const rows = buildLogbookRows(cases as never, {
      personId,
      personRole: person.role ? String(person.role) : null,
      includePatientName: wantNames,
      levels: profile.levels,
    });

    // Sorted into the portfolio's tables, where the College publishes them.
    const subspecialtyKey = String(body?.subspecialty ?? 'general');
    const sub = NPMCN_SUBSPECIALTIES.find((x) => x.key === subspecialtyKey)
      ?? NPMCN_SUBSPECIALTIES[0];
    const categorised = profile.categorised
      ? categoriseForNpmcn(rows, sub.sections)
      : null;

    // Audited whenever it is somebody else's book, or whenever names were
    // asked for. Both are the cases a hospital would want to be able to
    // answer questions about later.
    if (actor.id && (actor.id !== personId || includePatientName)) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'TRAINING_LOGBOOK_GENERATED',
          tableName: 'surgeries',
          recordId: personId,
          changes: JSON.stringify({
            subject: person.fullName,
            college: profile.key,
            from: from || null,
            to: to || null,
            cases: rows.length,
            includedPatientNames: wantNames,
          }),
        },
      }).catch(() => { /* the book stands even if the log does not */ });
    }

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        role: person.role ? String(person.role) : null,
        staffCode: person.staffCode ?? null,
      },
      college: {
        key: profile.key,
        college: profile.college,
        programme: profile.programme,
        discipline: profile.discipline,
        requirement: profile.requirement,
        sourceNote: profile.sourceNote,
        quotasVerified: profile.quotasVerified,
        totalRequired: profile.totalRequired,
        columns: profile.columns,
        attestation: profile.attestation,
        levels: profile.levels ?? null,
        guidance: profile.guidance ?? null,
        categorised: profile.categorised === true,
        patientNameColumn: profile.patientNameColumn === true,
      },
      from: from || null,
      to: to || null,
      includedPatientNames: wantNames,
      subspecialty: profile.categorised ? { key: sub.key, label: sub.label } : null,
      categorised,
      summary: logbookSummary(rows),
      quotas: quotaProgress(rows, profile),
      rows,
    });
  } catch (err) {
    console.error('[research/logbook] failed:', err);
    return NextResponse.json({ error: 'Could not build the log book' }, { status: 500 });
  }
}
