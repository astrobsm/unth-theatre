import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER", "PHARMACIST"];

const drugTypeEnum = z.enum([
  "ANTIBIOTIC",
  "ANALGESIC",
  "ANAESTHETIC_ADJUNCT",
  "IV_FLUID",
  "WOUND_DRESSING_AGENT",
  "ANTISEPTIC",
  "HAEMOSTATIC",
  "OTHER",
]);

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: drugTypeEnum.default("OTHER"),
  defaultDosage: z.string().optional().nullable(),
  defaultRoute: z.string().optional().nullable(),
  defaultQuantity: z.number().int().min(1).default(1),
  unit: z.string().default("vial"),
  specialty: z.string().optional().nullable(),
  isControlled: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  notes: z.string().optional().nullable(),
});

function isAdmin(role?: string) {
  return !!role && ADMIN_ROLES.includes(role);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const where: any = {};
  const type = searchParams.get("type");
  const specialty = searchParams.get("specialty");
  const activeOnly = searchParams.get("activeOnly");
  if (type) where.type = type;
  if (specialty) where.OR = [{ specialty }, { specialty: null }];
  if (activeOnly !== "false") where.isActive = true;

  const items = await prisma.surgicalDrugDressingTemplate.findMany({
    where,
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = upsertSchema.parse(await req.json());
    const created = await prisma.surgicalDrugDressingTemplate.create({ data });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = upsertSchema.parse(await req.json());
    if (!data.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { id, ...rest } = data;
    const updated = await prisma.surgicalDrugDressingTemplate.update({ where: { id }, data: rest });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const refCount = await prisma.surgeryDrugDressingRequest.count({ where: { templateId: id } });
  if (refCount > 0) {
    const updated = await prisma.surgicalDrugDressingTemplate.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ softDeleted: true, template: updated });
  }
  await prisma.surgicalDrugDressingTemplate.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
