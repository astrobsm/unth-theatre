import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Derive duty shift from a JS Date.
 * Shift windows (local time):
 *   MORNING: 08:00 – 16:00
 *   CALL:    16:00 – 22:00
 *   NIGHT:   22:00 – 08:00 (wraps)
 */
function shiftFromDate(d: Date): "MORNING" | "CALL" | "NIGHT" {
  const h = d.getHours();
  if (h >= 8 && h < 16) return "MORNING";
  if (h >= 16 && h < 22) return "CALL";
  return "NIGHT";
}

type StaffEntry = {
  id: string;
  userId: string;
  name: string;
  role: string;
  staffCode: string | null;
  phoneNumber: string | null;
  seniorityLevel: string | null;
  theatreId: string | null;
  shift: string;
};

/**
 * GET /api/roster/on-duty
 *
 * Query params:
 *   date       (required) — ISO date or datetime. The shift is derived from
 *                           the time portion when `shift` is not supplied.
 *   shift      (optional) — MORNING | CALL | NIGHT. Overrides derived shift.
 *   theatreId  (optional) — limit to a specific theatre. Omit (or pass
 *                           "any" / "all") to return staff on duty across
 *                           every theatre — the right behaviour for an
 *                           emergency surgery where we just need anyone
 *                           on duty in that role.
 *
 * Response:
 *   {
 *     date, shift, theatreId,
 *     team: {
 *       anaesthetist: StaffEntry | null,           // first ANAESTHETIST on duty
 *       anaestheticTechnician: StaffEntry | null,  // first ANAESTHETIC_TECHNICIAN
 *       scrubNurse: StaffEntry | null,             // first NURSE on duty
 *       circulatingNurse: StaffEntry | null,       // second NURSE on duty
 *       cleaner: StaffEntry | null,                // first CLEANER on duty
 *       porter: StaffEntry | null,                 // first PORTER on duty
 *       pharmacist: StaffEntry | null,             // first PHARMACIST on duty
 *     },
 *     candidates: { anaesthetists: StaffEntry[], anaestheticTechnicians: ..., nurses: ..., cleaners: ..., porters: ..., pharmacists: ... },
 *     rostersFound: number,
 *   }
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

    const shift =
      (shiftParam as "MORNING" | "CALL" | "NIGHT" | null) ||
      shiftFromDate(parsed);

    // Roster.date is a Prisma @db.Date — strip the time so equality matches.
    const dateOnly = new Date(
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    );

    const where: {
      date: Date;
      shift: "MORNING" | "CALL" | "NIGHT";
      theatreId?: string;
    } = {
      date: dateOnly,
      shift,
    };

    const theatreFilter = theatreIdParam?.trim();
    if (theatreFilter && theatreFilter !== "any" && theatreFilter !== "all") {
      where.theatreId = theatreFilter;
    }

    const rosters = await prisma.roster.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            staffCode: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: [
        // CONSULTANT first, then SENIOR_REGISTRAR, then REGISTRAR, then nulls.
        { seniorityLevel: "asc" },
        { uploadedAt: "desc" },
      ],
    });

    const toEntry = (r: (typeof rosters)[number]): StaffEntry => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.fullName,
      role: r.user.role,
      staffCode: r.user.staffCode,
      phoneNumber: r.user.phoneNumber,
      seniorityLevel: r.seniorityLevel ?? null,
      theatreId: r.theatreId ?? null,
      shift: r.shift,
    });

    const candidates = {
      anaesthetists: [] as StaffEntry[],
      anaestheticTechnicians: [] as StaffEntry[],
      nurses: [] as StaffEntry[],
      cleaners: [] as StaffEntry[],
      porters: [] as StaffEntry[],
      pharmacists: [] as StaffEntry[],
    };

    for (const r of rosters) {
      const entry = toEntry(r);
      switch (r.staffCategory) {
        case "ANAESTHETISTS":
          candidates.anaesthetists.push(entry);
          break;
        case "ANAESTHETIC_TECHNICIANS":
          candidates.anaestheticTechnicians.push(entry);
          break;
        case "NURSES":
          candidates.nurses.push(entry);
          break;
        case "CLEANERS":
          candidates.cleaners.push(entry);
          break;
        case "PORTERS":
          candidates.porters.push(entry);
          break;
        case "PHARMACISTS":
          candidates.pharmacists.push(entry);
          break;
      }
    }

    // Pick the most-senior anaesthetist (CONSULTANT > SENIOR_REGISTRAR > REGISTRAR).
    const senorityRank = (s: string | null) => {
      switch (s) {
        case "CONSULTANT":
          return 0;
        case "SENIOR_REGISTRAR":
          return 1;
        case "REGISTRAR":
          return 2;
        default:
          return 3;
      }
    };
    const sortedAnaesthetists = [...candidates.anaesthetists].sort(
      (a, b) => senorityRank(a.seniorityLevel) - senorityRank(b.seniorityLevel)
    );

    const team = {
      anaesthetist: sortedAnaesthetists[0] ?? null,
      anaestheticTechnician: candidates.anaestheticTechnicians[0] ?? null,
      scrubNurse: candidates.nurses[0] ?? null,
      circulatingNurse: candidates.nurses[1] ?? null,
      cleaner: candidates.cleaners[0] ?? null,
      porter: candidates.porters[0] ?? null,
      pharmacist: candidates.pharmacists[0] ?? null,
    };

    return NextResponse.json({
      date: dateOnly.toISOString().slice(0, 10),
      shift,
      theatreId: where.theatreId ?? null,
      team,
      candidates,
      rostersFound: rosters.length,
    });
  } catch (error) {
    console.error("[/api/roster/on-duty] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch on-duty roster" },
      { status: 500 }
    );
  }
}
