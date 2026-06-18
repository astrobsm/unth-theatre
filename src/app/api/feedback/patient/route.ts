import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

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

  const created = await prisma.patientFeedback.create({
    data: {
      patientName: d.patientName || null,
      folderNumber: d.folderNumber || null,
      phoneNumber: d.phoneNumber || null,
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
      source: d.source || "link",
    },
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
