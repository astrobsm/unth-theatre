// ============================================================
// The patient opening their own information sheet
// ------------------------------------------------------------
//   GET /api/counselling?t=<token>
//
// PUBLIC, and token-gated. The patient has no account and never will; the
// token is the credential, it expires, and it can be withdrawn.
//
// ANSWERS 200 WITH { ok: false, problem, message } RATHER THAN 404.
// The same shape as the feedback invitation, for the same reason: a patient
// who taps a link from a WhatsApp message and lands on a browser error page
// concludes the hospital is broken and does not ask anybody. A refusal that
// explains itself, on a page that still works, sends them to the ward
// instead.
//
// THE TOKEN IS MATCHED BY ITS HASH. The plain token is never stored, so this
// hashes what arrives and looks that up.
//
// WHAT IS RETURNED. The assembled leaflet, built from the SNAPSHOT on the
// issue row — not from the surgery as it stands today. A sheet is a document
// given on a date, and amending the case must not rewrite what the patient
// has already read.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { buildLeaflet } from '@/lib/counselling/leaflet';
import { hashCounsellingToken, linkState } from '@/lib/counselling/issue';

export const dynamic = 'force-dynamic';

/** "Wednesday, 18 November 2026" — readable, and unambiguous about the day. */
function readableDate(d: Date | null): string | null {
  if (!d) return null;
  try {
    return d.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() ?? '';
  if (!token) {
    return NextResponse.json({
      ok: false,
      problem: 'NOT_FOUND',
      message: 'This link is incomplete. Please open it again from the message you were sent.',
    });
  }

  try {
    const issue = await prisma.patientCounsellingIssue.findUnique({
      where: { tokenHash: hashCounsellingToken(token) },
    });

    const state = linkState(issue);
    if (!state.ok) {
      return NextResponse.json({ ok: false, problem: state.problem, message: state.message });
    }

    const row = issue!;

    // Recorded on first opening, and counted thereafter. Whether a patient
    // ever opened their sheet is worth knowing before the consent
    // conversation — and a leaflet nobody opened is not informed consent.
    await prisma.patientCounsellingIssue
      .update({
        where: { id: row.id },
        data: {
          openedAt: row.openedAt ?? new Date(),
          openCount: { increment: 1 },
        },
      })
      .catch(() => { /* reading must never fail because the counter did */ });

    const patient = row.patientId
      ? await prisma.patient
        .findUnique({
          where: { id: row.patientId },
          select: { name: true, folderNumber: true, ptNumber: true },
        })
        .catch(() => null)
      : null;

    const leaflet = buildLeaflet({
      procedureName: row.procedureName,
      procedureSlug: row.procedureSlug,
      category: row.category,
      subspecialty: row.subspecialty,
      indication: row.indication,
      patientName: patient?.name ?? null,
      patientIdentifier: patient?.folderNumber || patient?.ptNumber || null,
      surgeonName: row.surgeonName,
      scheduledFor: readableDate(row.scheduledFor),
      unit: row.unit,
    });

    return NextResponse.json({ ok: true, leaflet });
  } catch (err) {
    console.error('[counselling] read failed:', err);
    return NextResponse.json({
      ok: false,
      problem: 'NOT_FOUND',
      message: 'We could not open your information sheet just now. Please try again shortly, or '
        + 'ask your ward nurse for a printed copy.',
    });
  }
}
