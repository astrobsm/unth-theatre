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

const createSchema = z.object({
  category: z.enum(["THEATRE_MANAGEMENT", "APPLICATION"]),
  title: z.string().trim().max(200).optional(),
  message: z.string().trim().min(3, "Please describe your suggestion").max(5000),
  rating: z.number().int().min(1).max(5).optional(),
});

// GET /api/feedback/staff — admins see all; others see their own.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  const role = (session.user as any).role as string;
  const isAdmin = ADMIN_ROLES.includes(role);

  const where: any = {};
  if (!isAdmin) where.authorId = (session.user as any).id;
  if (category) where.category = category;
  if (status) where.status = status;

  const items = await prisma.staffFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ items, isAdmin });
}

// POST /api/feedback/staff — submit a suggestion.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const u = session.user as any;
  const created = await prisma.staffFeedback.create({
    data: {
      category: parsed.data.category,
      title: parsed.data.title || null,
      message: parsed.data.message,
      rating: parsed.data.rating ?? null,
      authorId: u.id ?? null,
      authorName: u.fullName || u.name || null,
      authorRole: u.role ?? null,
    },
  });

  return NextResponse.json({ ok: true, item: created }, { status: 201 });
}

// PATCH /api/feedback/staff — admins triage (status / notes).
const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_REVIEW", "ACTIONED", "CLOSED"]).optional(),
  adminNotes: z.string().trim().max(5000).optional(),
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

  const { id, ...rest } = parsed.data;
  const updated = await prisma.staffFeedback.update({ where: { id }, data: rest });
  return NextResponse.json({ ok: true, item: updated });
}
