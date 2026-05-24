import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER", "CONSUMABLE_PACK_PROVIDER"];

const consumableCategoryEnum = z.enum([
  "GLOVES",
  "GOWNS_DRAPES",
  "SUTURES",
  "SYRINGES_NEEDLES",
  "CATHETERS_TUBING",
  "DRESSING_PACKS",
  "SKIN_PREP",
  "CLEANING_SOLUTION",
  "STERILE_DRESSINGS",
  "IRRIGATION",
  "DIATHERMY",
  "SUCTION",
  "ANAESTHESIA_AIRWAY",
  "PPE",
  "OTHER",
]);

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  category: consumableCategoryEnum.default("OTHER"),
  size: z.string().optional().nullable(),
  unit: z.string().default("piece"),
  specialty: z.string().optional().nullable(),
  defaultQuantity: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  notes: z.string().optional().nullable(),
});

function isAdmin(role?: string) {
  return !!role && ADMIN_ROLES.includes(role);
}

// GET — list templates (filter by category, specialty, active)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const where: any = {};
  const category = searchParams.get("category");
  const specialty = searchParams.get("specialty");
  const activeOnly = searchParams.get("activeOnly");
  if (category) where.category = category;
  if (specialty) where.OR = [{ specialty }, { specialty: null }];
  if (activeOnly !== "false") where.isActive = true;

  const items = await prisma.surgicalConsumableTemplate.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(items);
}

// POST — create
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = upsertSchema.parse(await req.json());
    const created = await prisma.surgicalConsumableTemplate.create({ data });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — update
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = upsertSchema.parse(await req.json());
    if (!data.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { id, ...rest } = data;
    const updated = await prisma.surgicalConsumableTemplate.update({ where: { id }, data: rest });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — soft-delete (set isActive=false). Real delete only if no requests reference it.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const refCount = await prisma.surgeryConsumableRequest.count({ where: { templateId: id } });
  if (refCount > 0) {
    const updated = await prisma.surgicalConsumableTemplate.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ softDeleted: true, template: updated });
  }
  await prisma.surgicalConsumableTemplate.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
