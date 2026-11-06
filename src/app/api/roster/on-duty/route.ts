import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveOnDutyTeam, type OnDutyShift } from "@/lib/roster/onDutyTeam";

export const dynamic = "force-dynamic";

/**
 * GET /api/roster/on-duty
 *
 * Query params:
 *   date       (required) — ISO date or datetime. The shift is derived from
 *                           the time portion when `shift` is not supplied.
 *   shift      (optional) — MORNING | CALL | NIGHT. Overrides derived shift.
 *   for        (optional) — "emergency" answers with the on-call team rather
 *                           than the morning (elective) roster.
 *   theatreId  (optional) — limit to a specific theatre. Omit (or pass
 *                           "any" / "all") to return staff on duty across
 *                           every theatre — the right behaviour for an
 *                           emergency surgery where we just need anyone
 *                           on duty in that role.
 *
 * Response: { date, shift, purpose, theatreId, team, candidates, rostersFound }
 *
 * The resolution itself lives in src/lib/roster/onDutyTeam.ts, because the
 * emergency team chase has to reach exactly the people this endpoint names.
 * Two copies of "who is on call" would eventually disagree, and a screen
 * listing one anaesthetist while the WhatsApp went to another would discredit
 * both of them.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateRaw = searchParams.get("date");
    const shiftParam = searchParams.get("shift");
    const theatreIdParam = searchParams.get("theatreId");

    if (!dateRaw) {
      return NextResponse.json(
        { error: "Missing required query param: date" },
        { status: 400 }
      );
    }

    const parsed = new Date(dateRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    const result = await resolveOnDutyTeam({
      date: parsed,
      shift: (shiftParam as OnDutyShift | null) || null,
      purpose: searchParams.get("for") === "emergency" ? "emergency" : "elective",
      theatreId: theatreIdParam,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/roster/on-duty] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch on-duty roster" },
      { status: 500 }
    );
  }
}
