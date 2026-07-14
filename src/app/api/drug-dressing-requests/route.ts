import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { triggerRadio } from "@/lib/radioEvents";

export const dynamic = "force-dynamic";

const PHARMACY_ROLES = ["PHARMACIST", "ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"];

// GET /api/drug-dressing-requests?surgeryId=&status=
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

  const items = await prisma.surgeryDrugDressingRequest.findMany({
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
          surgeonName: true,
          location: true,
          theatreId: true,
          scrubNurseId: true,
          surgeryType: true,
        },
      },
    },
    orderBy: [{ surgery: { scheduledDate: "asc" } }, { createdAt: "asc" }],
  });

  const surgeryMap = new Map<string, any>();
  for (const item of items as any[]) {
    if (item.surgery?.id) surgeryMap.set(item.surgery.id, item.surgery);
  }
  const surgeries = Array.from(surgeryMap.values());
  if (surgeries.length) {
    const theatreIds = Array.from(new Set(surgeries.map((s) => s.theatreId).filter(Boolean)));
    const theatres = theatreIds.length
      ? await prisma.theatreSuite.findMany({
          where: { id: { in: theatreIds } },
          select: { id: true, name: true, location: true },
        })
      : [];
    const theatreById = new Map(theatres.map((t) => [t.id, t]));

    const scrubNurseIds = Array.from(new Set(surgeries.map((s) => s.scrubNurseId).filter(Boolean)));
    const scrubNurses = scrubNurseIds.length
      ? await prisma.user.findMany({
          where: { id: { in: scrubNurseIds } },
          select: { id: true, fullName: true, phoneNumber: true },
        })
      : [];
    const scrubNurseById = new Map(scrubNurses.map((u) => [u.id, u]));

    const surgeryIds = surgeries.map((s) => s.id);
    const dayKeys = Array.from(new Set(surgeries.map((s) => new Date(s.scheduledDate).toISOString().slice(0, 10))));
    const dayStarts = dayKeys.map((d) => new Date(`${d}T00:00:00`).getTime());
    const minDay = new Date(Math.min(...dayStarts));
    const maxDay = new Date(Math.max(...dayStarts));
    maxDay.setDate(maxDay.getDate() + 1);

    const allocations = await prisma.theatreAllocation.findMany({
      where: {
        OR: [{ surgeryId: { in: surgeryIds } }, { date: { gte: minDay, lt: maxDay } }],
      },
      include: {
        theatre: { select: { name: true } },
        scrubNurse: { select: { fullName: true, phoneNumber: true } },
      },
    });
    const bySurgeryId = new Map<string, (typeof allocations)[number]>();
    const byTheatreDay = new Map<string, (typeof allocations)[number]>();
    for (const allocation of allocations) {
      if (allocation.surgeryId) bySurgeryId.set(allocation.surgeryId, allocation);
      if (allocation.theatre?.name) {
        byTheatreDay.set(`${allocation.theatre.name.toLowerCase()}|${new Date(allocation.date).toISOString().slice(0, 10)}`, allocation);
      }
    }

    for (const item of items as any[]) {
      const surgery = item.surgery;
      if (!surgery) continue;
      let allocation = bySurgeryId.get(surgery.id);
      const theatre = surgery.theatreId ? theatreById.get(surgery.theatreId) : null;
      const surgeryScrubNurse = surgery.scrubNurseId ? scrubNurseById.get(surgery.scrubNurseId) : null;
      if (!allocation && surgery.location) {
        allocation = byTheatreDay.get(`${surgery.location.toLowerCase()}|${new Date(surgery.scheduledDate).toISOString().slice(0, 10)}`);
      }
      surgery.scrubNurse = allocation?.scrubNurse
        ? { fullName: allocation.scrubNurse.fullName, phoneNumber: allocation.scrubNurse.phoneNumber }
        : surgeryScrubNurse
          ? { fullName: surgeryScrubNurse.fullName, phoneNumber: surgeryScrubNurse.phoneNumber }
          : null;
      surgery.theatreName = allocation?.theatre?.name || theatre?.name || surgery.location || null;
      surgery.theatreLocation = theatre?.location || surgery.location || null;
    }
  }
  return NextResponse.json(items);
}

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(["START_PACKING", "PACKED", "DELIVERED", "CANCEL"]),
  packNotes: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!PHARMACY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id, action, packNotes } = patchSchema.parse(await req.json());
    const existing = await prisma.surgeryDrugDressingRequest.findUnique({ where: { id } });
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
    const updated = await prisma.surgeryDrugDressingRequest.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — broadcast Theatre Radio "Drugs/dressings packed for surgery"
const broadcastSchema = z.object({ surgeryId: z.string() });
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!PHARMACY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { surgeryId } = broadcastSchema.parse(await req.json());
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      include: { patient: { select: { name: true } } },
    });
    if (!surgery) return NextResponse.json({ error: "Surgery not found" }, { status: 404 });

    await triggerRadio({
      category: "WORKFLOW",
      title: "Drugs & dressings ready",
      message: `Pharmacy has packed the drugs and dressings for ${surgery.patient.name} (${surgery.procedureName}). Anaesthetist please collect.`,
      priority: 70,
      triggeredById: (session.user as any).id,
      metadata: { source: "DrugDressingPharmacy", surgeryId },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
