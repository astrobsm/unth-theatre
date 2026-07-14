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
      requestedBy: { select: { id: true, fullName: true, phoneNumber: true } },
      surgery: {
        select: {
          id: true,
          patient: {
            select: {
              id: true,
              name: true,
              folderNumber: true,
              phoneNumber: true,
              caregiverName: true,
              caregiverPhone: true,
            },
          },
          procedureName: true,
          scheduledDate: true,
          scheduledTime: true,
          subspecialty: true,
          surgeryType: true,
          surgeonName: true,
          location: true,
          theatreId: true,
          scrubNurseId: true,
          surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        },
      },
    },
    orderBy: [{ surgery: { scheduledDate: "asc" } }, { createdAt: "asc" }],
  });

  // Fallback: for requests with no linked requester (e.g. older bookings) but a
  // saved requester name — or surgeries whose surgeon was typed in as free text
  // with no linked profile — look up that staff member's profile so the pack
  // provider still sees the phone number they entered when onboarding.
  const namesToResolve = new Set<string>();
  for (const it of items as any[]) {
    if (!it.requestedBy && it.requestedByName) namesToResolve.add(it.requestedByName.trim());
    const s = it.surgery;
    if (s && !s.surgeon?.phoneNumber && s.surgeonName) namesToResolve.add(s.surgeonName.trim());
  }
  const unlinkedNames = Array.from(namesToResolve).filter(Boolean);

  if (unlinkedNames.length) {
    const profiles = await prisma.user.findMany({
      where: { fullName: { in: unlinkedNames, mode: "insensitive" } },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    const byName = new Map(profiles.map((p) => [p.fullName.trim().toLowerCase(), p]));
    for (const it of items as any[]) {
      if (!it.requestedBy && it.requestedByName) {
        const p = byName.get(it.requestedByName.trim().toLowerCase());
        if (p) it.requestedBy = { id: p.id, fullName: p.fullName, phoneNumber: p.phoneNumber };
      }
      const s = it.surgery;
      if (s && !s.surgeon?.phoneNumber && s.surgeonName) {
        const p = byName.get(s.surgeonName.trim().toLowerCase());
        if (p) s.surgeon = { id: p.id, fullName: p.fullName, phoneNumber: p.phoneNumber };
      }
    }
  }

  // Attach the scrub nurse (and circulating nurse) assigned to each surgery's
  // theatre so the pack provider knows who to hand the pack to. Packs must NOT
  // be given to patients — patients only present evidence of payment.
  const surgeryMap = new Map<string, any>();
  for (const it of items as any[]) {
    if (it.surgery?.id) surgeryMap.set(it.surgery.id, it.surgery);
  }
  const surgeries = Array.from(surgeryMap.values());
  const surgeryIds = surgeries.map((s) => s.id);
  if (surgeryIds.length) {
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

    const dayKeys = Array.from(
      new Set(surgeries.map((s) => new Date(s.scheduledDate).toISOString().slice(0, 10)))
    );
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
        circulatingNurse: { select: { fullName: true, phoneNumber: true } },
      },
    });
    const bySurgeryId = new Map<string, (typeof allocations)[number]>();
    const byTheatreDay = new Map<string, (typeof allocations)[number]>();
    for (const a of allocations) {
      if (a.surgeryId) bySurgeryId.set(a.surgeryId, a);
      if (a.theatre?.name) {
        byTheatreDay.set(`${a.theatre.name.toLowerCase()}|${new Date(a.date).toISOString().slice(0, 10)}`, a);
      }
    }
    for (const it of items as any[]) {
      const s = it.surgery;
      if (!s) continue;
      let a = bySurgeryId.get(s.id);
      const theatre = s.theatreId ? theatreById.get(s.theatreId) : null;
      const surgeryScrubNurse = s.scrubNurseId ? scrubNurseById.get(s.scrubNurseId) : null;
      if (!a && s.location) {
        a = byTheatreDay.get(`${s.location.toLowerCase()}|${new Date(s.scheduledDate).toISOString().slice(0, 10)}`);
      }
      s.scrubNurse = a?.scrubNurse
        ? { fullName: a.scrubNurse.fullName, phoneNumber: a.scrubNurse.phoneNumber }
        : surgeryScrubNurse
          ? { fullName: surgeryScrubNurse.fullName, phoneNumber: surgeryScrubNurse.phoneNumber }
          : null;
      s.circulatingNurse = a?.circulatingNurse
        ? { fullName: a.circulatingNurse.fullName, phoneNumber: a.circulatingNurse.phoneNumber }
        : null;
      s.theatreName = a?.theatre?.name || theatre?.name || s.location || null;
      s.theatreLocation = theatre?.location || s.location || null;
    }
  }

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
