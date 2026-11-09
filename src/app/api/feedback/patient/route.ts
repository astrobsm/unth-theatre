import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  hashInviteToken, inviteState, careContextOf,
} from "@/lib/patients/feedbackInvite";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = [
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "THEATRE_CHAIRMAN",
  "CHIEF_MEDICAL_DIRECTOR",
  "CMAC",
];

const rating = z.number().int().min(1).max(5).optional();

// Public submission schema. Everything is optional except that at least one of
// an overall rating or a message must be present (checked below).
const createSchema = z.object({
  patientName: z.string().trim().max(200).optional(),
  folderNumber: z.string().trim().max(100).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  relationship: z.string().trim().max(60).optional(),
  overallRating: rating,
  staffCourtesyRating: rating,
  cleanlinessRating: rating,
  waitTimeRating: rating,
  communicationRating: rating,
  painManagementRating: rating,
  journeyStage: z.string().trim().max(120).optional(),
  whatWentWell: z.string().trim().max(5000).optional(),
  whatToImprove: z.string().trim().max(5000).optional(),
  message: z.string().trim().max(5000).optional(),
  wouldRecommend: z.boolean().optional(),
  source: z.string().trim().max(20).optional(),
  /** An end-of-care invitation. See the anonymity handling in POST below. */
  token: z.string().trim().max(200).optional(),
});

// POST /api/feedback/patient — PUBLIC: patients/relatives submit their experience.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const d = parsed.data;
  const hasContent =
    d.overallRating != null ||
    !!d.message?.trim() ||
    !!d.whatWentWell?.trim() ||
    !!d.whatToImprove?.trim();
  if (!hasContent) {
    return NextResponse.json(
      { error: "Please give a rating or tell us about your experience." },
      { status: 400 },
    );
  }

  // ── An end-of-care invitation ─────────────────────────────────────────
  //
  // THIS IS WHERE THE LINK IS SEVERED, and it is the only reason the word
  // "anonymous" may appear on the page the patient just read.
  //
  // The request row knows which patient was invited — that is how one
  // invitation per case is kept and how the unit is attached. It must not know
  // it a moment longer than the submission takes. So the feedback is written,
  // the row is marked used, and its patientId and surgeryId are cleared, all
  // in ONE transaction: if the write succeeds and the clearing does not, the
  // database is left holding exactly the join this feature promises does not
  // exist.
  //
  // What is deliberately NOT stored: responseData on the request row. The
  // column exists and filling it would put the patient's words next to their
  // patientId's former home, with the submission timestamp to match. The
  // feedback lives in patient_feedback; the request row keeps only the fact
  // that it was used.
  let careUnit: string | null = null;
  let careComplex: string | null = null;
  let inviteId: string | null = null;

  if (d.token) {
    const row = await prisma.feedbackRequest.findUnique({
      where: { tokenHash: hashInviteToken(d.token) },
      select: { id: true, expiresAt: true, submittedAt: true, surgeryId: true },
    });

    const state = inviteState(row);
    if (!state.ok) {
      return NextResponse.json({ error: state.message, problem: state.problem }, { status: 409 });
    }

    inviteId = row!.id;
    if (row!.surgeryId) {
      const s = await prisma.surgery.findUnique({
        where: { id: row!.surgeryId },
        select: { unit: true, location: true },
      }).catch(() => null);
      const ctx = careContextOf(s ?? {});
      careUnit = ctx.unit;
      careComplex = ctx.complex;
    }
  }

  const identified = inviteId === null;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.patientFeedback.create({
      data: {
        // An invited submission carries no identity, whatever was posted. The
        // form does not offer these fields when a token is present; this makes
        // that true of the endpoint as well, so a crafted request cannot sign
        // a submission the patient believed was anonymous.
        patientName: identified ? (d.patientName || null) : null,
        folderNumber: identified ? (d.folderNumber || null) : null,
        phoneNumber: identified ? (d.phoneNumber || null) : null,
        relationship: d.relationship || null,
        overallRating: d.overallRating ?? null,
        staffCourtesyRating: d.staffCourtesyRating ?? null,
        cleanlinessRating: d.cleanlinessRating ?? null,
        waitTimeRating: d.waitTimeRating ?? null,
        communicationRating: d.communicationRating ?? null,
        painManagementRating: d.painManagementRating ?? null,
        journeyStage: d.journeyStage || null,
        whatWentWell: d.whatWentWell || null,
        whatToImprove: d.whatToImprove || null,
        message: d.message || null,
        wouldRecommend: d.wouldRecommend ?? null,
        source: identified ? (d.source || "link") : "end-of-care",
        careUnit,
        careComplex,
      },
    });

    if (inviteId) {
      await tx.feedbackRequest.update({
        where: { id: inviteId },
        data: { submittedAt: new Date(), patientId: null, surgeryId: null },
      });
    }

    return row;
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

// GET /api/feedback/patient — ADMIN: review submissions.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where: any = {};
  if (status) where.status = status;

  const items = await prisma.patientFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  // Simple aggregate for the dashboard summary.
  const agg = await prisma.patientFeedback.aggregate({
    _avg: { overallRating: true },
    _count: { _all: true },
  });

  return NextResponse.json({
    items,
    summary: {
      count: agg._count._all,
      avgOverall: agg._avg.overallRating,
    },
  });
}

// PATCH /api/feedback/patient — ADMIN: moderate (status).
const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "REVIEWED", "PUBLISHED", "ARCHIVED"]),
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await prisma.patientFeedback.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, item: updated });
}
