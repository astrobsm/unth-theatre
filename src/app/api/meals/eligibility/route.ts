import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/meals/eligibility?date=YYYY-MM-DD
 *
 * Returns whether the *current* user is eligible for a FREE on-duty meal
 * for the given day (defaults to today).
 *
 * Eligible if either:
 *   - A Roster entry exists for the user on that date, OR
 *   - The user is a member of a SurgicalTeamMember row on a Surgery
 *     scheduled for that date.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string | undefined;
    if (!userId) {
      return NextResponse.json({
        eligible: false,
        reason: "No user id on session",
      });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const day = dateParam ? new Date(dateParam) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [roster, surgicalMembership, transportCredit, theatreTaskCredit] =
      await Promise.all([
        prisma.roster.findFirst({
          where: { userId, date: { gte: start, lt: end } },
          select: { id: true, shift: true, staffCategory: true, location: true },
        }),
        prisma.surgicalTeamMember.findFirst({
          where: {
            userId,
            surgery: { scheduledDate: { gte: start, lt: end } },
          },
          select: {
            id: true,
            role: true,
            surgery: { select: { procedureName: true, scheduledTime: true } },
          },
        }),
        // Porter transported a patient to the holding area today.
        prisma.holdingAreaAssessment.findFirst({
          where: {
            transportRecordedAt: { gte: start, lt: end },
            transportPorterIds: { contains: userId },
          },
          select: { id: true, transportRecordedAt: true },
        }),
        // Porter / cleaner carried out a theatre task today (received patient
        // or cleaned the theatre between cases).
        prisma.theatreCaseFlow.findFirst({
          where: {
            updatedAt: { gte: start, lt: end },
            OR: [
              { porterIds: { contains: userId } },
              { cleanerIds: { contains: userId } },
            ],
          },
          select: { id: true, theatreName: true },
        }),
      ]);

    // ── Rostered is EXPECTED, not eligible ──────────────────────────────────
    // The previous first branch was `if (roster) return eligible`, which granted
    // a meal for appearing on a roster and — worse — short-circuited the activity
    // checks written directly below it. The evidence this hospital already
    // collects was being calculated and then skipped for exactly the people most
    // likely to be rostered.
    //
    // Tri-state rather than a flat block, deliberately. Several roles have no
    // activity pathway in ORM yet (pharmacy, CSSD, biomedical, recovery). Denying
    // them today would starve people who genuinely worked, which is a worse fault
    // than feeding someone who did not. So roster-only becomes ELIGIBLE PENDING
    // VERIFICATION: the meals screen shows it, a person confirms it, and it is
    // recorded — rather than being waved through invisibly.

    // Did the case actually run with this person on it? Assignment is not work;
    // a case that reached theatre and started or finished is.
    const caseWorked = await prisma.surgery.findFirst({
      where: {
        scheduledDate: { gte: start, lt: end },
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        OR: [{ surgeonId: userId }, { anesthetistId: userId }, { scrubNurseId: userId }],
      },
      select: { id: true, procedureName: true, status: true },
    });

    const activity =
      caseWorked
        ? { source: 'CASE_WORKED', details: { task: `${caseWorked.procedureName} — ${caseWorked.status.toLowerCase()}` } }
        : transportCredit
          ? { source: 'PATIENT_TRANSPORT', details: { task: 'Transported a patient to the holding area' } }
          : theatreTaskCredit
            ? { source: 'THEATRE_TASK', details: { task: 'Theatre reception / cleaning task', theatre: theatreTaskCredit.theatreName } }
            : null;

    if (activity) {
      return NextResponse.json({
        eligible: true,
        verified: true,
        source: activity.source,
        details: activity.details,
      });
    }

    // Expected, but nothing recorded. Not refused — flagged.
    const expected = roster ?? surgicalMembership ?? null;
    if (expected) {
      return NextResponse.json({
        eligible: true,
        // The meals screen must show this differently and ask somebody to confirm.
        verified: false,
        requiresVerification: true,
        source: roster ? 'ROSTER_ONLY' : 'ASSIGNED_ONLY',
        reason: roster
          ? 'Rostered today, but no theatre activity has been recorded yet.'
          : 'Assigned to a case today, but the case has not started and no activity is recorded.',
        details: roster
          ? { shift: roster.shift, staffCategory: roster.staffCategory, location: roster.location }
          : {
              role: surgicalMembership!.role,
              procedure: surgicalMembership!.surgery.procedureName,
              time: surgicalMembership!.surgery.scheduledTime,
            },
      });
    }

    return NextResponse.json({
      eligible: false,
      verified: false,
      source: null,
      reason: 'Not rostered, not assigned to a case, and no theatre activity recorded today.',
      details: null,
    });
  } catch (error) {
    console.error("[/api/meals/eligibility GET]", error);
    return NextResponse.json(
      { error: "Failed to check eligibility" },
      { status: 500 }
    );
  }
}
