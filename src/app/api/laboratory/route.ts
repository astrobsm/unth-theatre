import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import {
  disciplineOf, disciplinesFor, isDiscipline, mayReport, mayVerify,
  type LabDiscipline,
} from '@/lib/diagnostics/disciplines';

export const dynamic = 'force-dynamic';

/**
 * The laboratory's own worklist, and the result it issues.
 *
 * Results already existed in two places and neither served the laboratory.
 * PreoperativeInvestigation carries what an elective case was asked for;
 * EmergencyLabTest carries the emergency workup. Both are written from the
 * requesting side, and a scientist wanting to know "what am I to report on
 * today, for patients going to theatre" had nowhere to look.
 *
 * This reads both streams, sorts them onto benches, and takes the result back.
 * Elective and emergency together, because the scientist's job is the same and
 * a second screen for emergencies is a second screen to forget to open.
 */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Attachments are held inline as data URLs, as elsewhere in this application. */
const MAX_ATTACHMENT_CHARS = 6_000_000; // ~4.5 MB of file

interface WorkItem {
  key: string;
  source: 'ELECTIVE' | 'EMERGENCY';
  requestId: string;
  patientId: string | null;
  patientName: string;
  folderNumber: string | null;
  surgeryId: string | null;
  procedureName: string | null;
  scheduledDate: string | null;
  urgent: boolean;
  testName: string;
  discipline: LabDiscipline;
  requestedAt: string;
  resulted: boolean;
}

/**
 * GET /api/laboratory?discipline=&days=
 *
 * Outstanding work for a bench, for patients with a case coming up. Defaults to
 * the benches this person actually reports on: a worklist showing every
 * discipline to everybody is a worklist nobody owns.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sp = request.nextUrl.searchParams;
    const role = (session.user.role ?? '').toUpperCase();
    const mine = disciplinesFor(role);

    const asked = sp.get('discipline');
    // Clinicians hold no bench; they read everything, because the result is
    // what they are waiting for.
    const wanted: LabDiscipline[] = isDiscipline(asked)
      ? [asked]
      : (mine.length ? mine : (['HAEMATOLOGY', 'CHEMICAL_PATHOLOGY', 'MICROBIOLOGY_IMMUNOLOGY', 'BLOOD_BANK', 'HISTOPATHOLOGY', 'OTHER'] as LabDiscipline[]));

    const days = Math.min(Math.max(Number(sp.get('days') ?? 14) || 14, 1), 60);
    const horizon = new Date(Date.now() + days * 24 * 60 * 60_000);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);

    const [elective, emergencies, reports] = await Promise.all([
      // Elective: investigations asked for on a case that has not happened yet.
      prisma.preoperativeInvestigation.findMany({
        where: {
          requestedAt: { gte: since },
          surgery: {
            scheduledDate: { lte: horizon },
            status: { notIn: ['CANCELLED', 'COMPLETED'] },
          },
        },
        select: {
          id: true, testName: true, testCategory: true, urgency: true,
          requestedAt: true, resultsAvailable: true, patientId: true, surgeryId: true,
          patient: { select: { name: true, folderNumber: true } },
          surgery: { select: { procedureName: true, scheduledDate: true, surgeryType: true } },
        },
        orderBy: { requestedAt: 'desc' },
        take: 300,
      }).catch(() => []),

      prisma.emergencyLabRequest.findMany({
        where: { requestedAt: { gte: since } },
        select: {
          id: true, patientName: true, folderNumber: true, surgeryId: true,
          requestedAt: true, status: true,
          labTests: {
            select: {
              id: true, testName: true, testCategory: true, status: true,
              resultValue: true, resultEnteredAt: true,
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
        take: 200,
      }).catch(() => []),

      prisma.labResultReport.findMany({
        where: { enteredAt: { gte: since } },
        orderBy: { enteredAt: 'desc' },
        take: 300,
      }).catch(() => []),
    ]);

    const items: WorkItem[] = [];

    elective.forEach((i) => {
      items.push({
        key: `elective:${i.id}`,
        source: 'ELECTIVE',
        requestId: i.id,
        patientId: i.patientId,
        patientName: i.patient?.name ?? 'Patient',
        folderNumber: i.patient?.folderNumber ?? null,
        surgeryId: i.surgeryId,
        procedureName: i.surgery?.procedureName ?? null,
        scheduledDate: i.surgery?.scheduledDate?.toISOString() ?? null,
        // The investigation's own urgency, or the case being an emergency —
        // a routine test for a case going tonight is not routine work.
        urgent: i.urgency === 'EMERGENCY' || i.surgery?.surgeryType === 'EMERGENCY',
        testName: i.testName,
        discipline: disciplineOf({ category: i.testCategory, testName: i.testName }),
        requestedAt: i.requestedAt.toISOString(),
        resulted: i.resultsAvailable,
      });
    });

    emergencies.forEach((r) => {
      r.labTests.forEach((t) => {
        items.push({
          key: `emergency:${t.id}`,
          source: 'EMERGENCY',
          requestId: r.id,
          patientId: null,
          patientName: r.patientName,
          folderNumber: r.folderNumber,
          surgeryId: r.surgeryId,
          procedureName: null,
          scheduledDate: null,
          urgent: true,
          testName: t.testName,
          discipline: disciplineOf({ category: t.testCategory, testName: t.testName }),
          requestedAt: r.requestedAt.toISOString(),
          resulted: !!t.resultEnteredAt || !!t.resultValue,
        });
      });
    });

    const onMyBench = items.filter((i) => wanted.includes(i.discipline));

    return NextResponse.json({
      // What this person may do, so the screen does not offer a button the
      // server will refuse.
      myDisciplines: mine,
      canVerify: mine.filter((d) => mayVerify(role, d)),
      discipline: isDiscipline(asked) ? asked : null,
      // Urgent first, then oldest — the one that has been waiting longest is
      // the one somebody is standing in a theatre for.
      items: onMyBench.sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        if (a.resulted !== b.resulted) return a.resulted ? 1 : -1;
        return a.requestedAt.localeCompare(b.requestedAt);
      }).slice(0, 200),
      reports: reports.filter((r) => wanted.includes(r.discipline as LabDiscipline)),
    });
  } catch (error) {
    return apiError('laboratory GET', error);
  }
}

/** POST /api/laboratory — issue a result. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const role = (session.user.role ?? '').toUpperCase();
    const body = await request.json().catch(() => ({}));

    const discipline = body.discipline;
    const patientId = str(body.patientId, 64);
    const testName = str(body.testName, 200);
    const resultSummary = str(body.resultSummary, 8000);

    if (!isDiscipline(discipline)) {
      return NextResponse.json({ error: 'Say which bench this result is from.' }, { status: 400 });
    }
    if (!mayReport(role, discipline)) {
      return NextResponse.json({
        error: 'You do not report on this bench. A result carries the name of the person who issued it, so it may only be entered by somebody who works it.',
        code: 'NOT_YOUR_BENCH',
      }, { status: 403 });
    }
    if (!patientId || !testName || !resultSummary) {
      return NextResponse.json({
        error: 'A result needs the patient, the test and the finding.',
        problems: [
          ...(patientId ? [] : [{ field: 'patientId', message: 'No patient chosen.' }]),
          ...(testName ? [] : [{ field: 'testName', message: 'The test has not been named.' }]),
          ...(resultSummary ? [] : [{ field: 'resultSummary', message: 'The result itself is empty.' }]),
        ],
      }, { status: 400 });
    }

    const attachment = typeof body.attachment === 'string' ? body.attachment : '';
    if (attachment.length > MAX_ATTACHMENT_CHARS) {
      return NextResponse.json({
        error: 'That file is too large to attach. Around 4 MB is the limit — a photograph taken on a phone is usually well over it, so reduce the size or attach the PDF instead.',
        code: 'TOO_LARGE',
      }, { status: 413 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, name: true },
    });
    if (!patient) {
      return NextResponse.json({ error: 'That patient is not on file.' }, { status: 404 });
    }

    // Verified on entry only where the person may release. Everything else is
    // provisional and says so: an entered figure is not yet fit to operate on.
    const wantsVerified = body.verified === true;
    const verified = wantsVerified && mayVerify(role, discipline);

    const report = await prisma.labResultReport.create({
      data: {
        patientId,
        surgeryId: str(body.surgeryId, 64) || null,
        emergencyLabRequestId: str(body.emergencyLabRequestId, 64) || null,
        discipline,
        testName,
        urgent: body.urgent === true,
        resultSummary,
        resultValues: str(body.resultValues, 8000) || null,
        referenceRange: str(body.referenceRange, 500) || null,
        attachment: attachment || null,
        attachmentName: str(body.attachmentName, 200) || null,
        attachmentType: str(body.attachmentType, 100) || null,
        abnormal: body.abnormal === true,
        critical: body.critical === true,
        status: verified ? 'VERIFIED' : 'PROVISIONAL',
        enteredById: session.user.id,
        enteredByName: session.user.name ?? 'Laboratory',
        verifiedById: verified ? session.user.id : null,
        verifiedByName: verified ? (session.user.name ?? 'Laboratory') : null,
        verifiedAt: verified ? new Date() : null,
        notes: str(body.notes, 2000) || null,
      },
    });

    // A critical result is not delivered by being in the system. The surgical
    // team is told by name, and the acknowledgement is recorded separately.
    let told: string | null = null;
    if (report.critical && report.surgeryId) {
      told = await tellTheSurgicalTeam(report.surgeryId, {
        patientName: patient.name, testName, resultSummary,
      });
    }

    return NextResponse.json({
      report,
      verified,
      notified: told,
      message: verified
        ? 'Result released.'
        : 'Result entered as provisional. It is visible to the team but is not yet released — a scientist must verify it.',
    });
  } catch (error) {
    return apiError('laboratory POST', error);
  }
}

/**
 * Tell the people on the case that a critical result exists.
 *
 * By name, to the six named posts on the surgery. Never fails the result:
 * losing a critical result because a notification insert failed would be the
 * worst possible outcome of trying to make it more visible.
 */
async function tellTheSurgicalTeam(
  surgeryId: string,
  what: { patientName: string; testName: string; resultSummary: string },
): Promise<string | null> {
  try {
    const s = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        surgeonId: true, assistantSurgeonId: true, anesthetistId: true,
        supervisingConsultantId: true, scrubNurseId: true, theatreTechnicianId: true,
      },
    });
    if (!s) return null;

    const ids = Array.from(new Set(Object.values(s).filter(Boolean) as string[]));
    if (!ids.length) return null;

    await prisma.systemNotification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: 'SYSTEM_ALERT' as never,
        title: `Critical result — ${what.patientName}`,
        message: `${what.testName}: ${what.resultSummary.slice(0, 300)}`,
        priority: 'URGENT',
        actionUrl: `/dashboard/surgeries/${surgeryId}`,
        relatedEntityType: 'LAB_RESULT',
        relatedEntityId: surgeryId,
      })) as never,
    });

    return `${ids.length} on the case notified`;
  } catch (err) {
    console.error('[laboratory] could not notify the surgical team:', err);
    return null;
  }
}
