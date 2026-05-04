import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = [
  "NURSES",
  "ANAESTHETISTS",
  "PORTERS",
  "CLEANERS",
  "ANAESTHETIC_TECHNICIANS",
  "PHARMACISTS",
  "RECOVERY_NURSES",
] as const;

const entrySchema = z.object({
  staffName: z.string().min(1),
  date: z.string().min(1), // ISO yyyy-mm-dd
  shift: z.enum(["MORNING", "CALL", "NIGHT"]),
  seniorityLevel: z
    .enum(["CONSULTANT", "SENIOR_REGISTRAR", "REGISTRAR"])
    .optional()
    .nullable(),
  subRole: z
    .enum(["SCRUB", "CIRCULATING", "HOLDING_AREA", "SUPERVISING"])
    .optional()
    .nullable(),
  theatreId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const weeklySchema = z.object({
  staffCategory: z.enum(VALID_CATEGORIES),
  weekStart: z.string().min(1), // ISO date — Monday of the week
  location: z.enum(["MAIN_THEATRE", "A_AND_E"]).default("MAIN_THEATRE"),
  entries: z.array(entrySchema).min(1),
});

/**
 * POST /api/roster/weekly
 *
 * Bulk-create a weekly roster for a single staff group at a single location
 * (Main Theatre Complex OR Accident & Emergency Theatre).
 *
 * Body shape:
 *   {
 *     staffCategory: "NURSES" | "ANAESTHETISTS" | ...,
 *     weekStart: "2026-05-04",           // Monday
 *     location:  "MAIN_THEATRE" | "A_AND_E",
 *     entries: [{ staffName, date, shift, seniorityLevel?, subRole?, theatreId?, notes? }, ...]
 *   }
 *
 * For each entry we resolve a User by fullName/staffCode (case-insensitive).
 * Entries without a matching User are returned in `errors[]` and skipped.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = weeklySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 }
      );
    }
    const { staffCategory, location, entries } = parsed.data;

    const created: any[] = [];
    const errors: { row: number; error: string; data: any }[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { fullName: { contains: entry.staffName, mode: "insensitive" } },
              { staffCode: entry.staffName },
            ],
          },
        });

        if (!user) {
          errors.push({
            row: i + 1,
            error: `No matching user found for "${entry.staffName}"`,
            data: entry,
          });
          continue;
        }

        const row = await prisma.roster.create({
          data: {
            userId: user.id,
            staffName: entry.staffName,
            staffCategory,
            date: new Date(entry.date),
            shift: entry.shift,
            seniorityLevel: entry.seniorityLevel ?? null,
            subRole: entry.subRole ?? null,
            location,
            theatreId: entry.theatreId ?? null,
            uploadedBy: session.user.id,
            notes: entry.notes ?? null,
          },
        });

        created.push(row);
      } catch (err: any) {
        errors.push({
          row: i + 1,
          error: err.message ?? String(err),
          data: entry,
        });
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      errors: errors.length,
      details: { created, errors },
    });
  } catch (error) {
    console.error("[/api/roster/weekly] error:", error);
    return NextResponse.json(
      { error: "Failed to submit weekly roster" },
      { status: 500 }
    );
  }
}
