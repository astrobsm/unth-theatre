import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { triggerRadio } from "@/lib/radioEvents";

export const dynamic = "force-dynamic";

const PACK_ROLES = [
  "CONSUMABLE_PACK_PROVIDER",
  "THEATRE_STORE_KEEPER",
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
];

// GET /api/consumable-requests?surgeryId=&status=&fromDate=&toDate=
// Used by the Consumable Pack Provider dashboard.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const surgeryId = searchParams.get("surgeryId");
  const status = searchParams.get("status");
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");

  const where: any = {};
  if (surgeryId) where.surgeryId = surgeryId;
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.surgery = {
      scheduledDate: {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate ? { lte: new Date(toDate) } : {}),
      },
    };
  }

  const items = await prisma.surgeryConsumableRequest.findMany({
    where,
    include: {
      surgery: {
        select: {
          id: true,
          patient: { select: { name: true, folderNumber: true } },
          procedureName: true,
          scheduledDate: true,
          scheduledTime: true,
          subspecialty: true,
          surgeryType: true,
          surgeonName: true,
          location: true,
        },
      },
    },
    orderBy: [{ surgery: { scheduledDate: "asc" } }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(["START_PACKING", "PACKED", "DELIVERED", "CANCEL"]),
  packNotes: z.string().optional(),
});

// PATCH — pack provider updates status
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!PACK_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id, action, packNotes } = patchSchema.parse(await req.json());
    const existing = await prisma.surgeryConsumableRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    switch (action) {
      case "START_PACKING":
        data.status = "PACKING";
        break;
      case "PACKED":
        data.status = "PACKED";
        data.packedById = (session.user as any).id;
        data.packedByName = (session.user as any).fullName || (session.user as any).name;
        data.packedAt = new Date();
        if (packNotes) data.packNotes = packNotes;
        break;
      case "DELIVERED":
        data.status = "DELIVERED";
        break;
      case "CANCEL":
        data.status = "CANCELLED";
        if (packNotes) data.packNotes = packNotes;
        break;
    }
    const updated = await prisma.surgeryConsumableRequest.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — broadcast Theatre Radio "All consumables packed and ready" for a surgery
const broadcastSchema = z.object({
  surgeryId: z.string(),
});
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!PACK_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { surgeryId } = broadcastSchema.parse(await req.json());
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      include: { patient: { select: { name: true, folderNumber: true } } },
    });
    if (!surgery) return NextResponse.json({ error: "Surgery not found" }, { status: 404 });

    await triggerRadio({
      category: "WORKFLOW",
      title: "Consumables ready",
      message: `Surgical consumables for ${surgery.patient.name} (${surgery.procedureName}) are packed and ready in the theatre store.`,
      priority: 60,
      triggeredById: (session.user as any).id,
      metadata: { source: "ConsumablePackProvider", surgeryId },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
