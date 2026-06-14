import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { triggerRadio } from "@/lib/radioEvents";

export const dynamic = "force-dynamic";

const SURGEON_ROLES = [
  "SURGEON",
  "CONSULTANT",
  "SENIOR_REGISTRAR",
  "REGISTRAR",
  "HOUSE_OFFICER",
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
];
const PHARMACY_ROLES = ["PHARMACIST", "ADMIN", "SYSTEM_ADMINISTRATOR"];
const READ_ROLES = Array.from(new Set([...SURGEON_ROLES, ...PHARMACY_ROLES, "RECOVERY_ROOM_NURSE", "THEATRE_MANAGER"]));

const medicationItemSchema = z.object({
  drugName: z.string().min(1),
  category: z.string().optional(),
  dosage: z.string().optional(),
  route: z.string().optional(),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  isControlled: z.boolean().default(false),
  notes: z.string().optional(),
});

const createSchema = z.object({
  surgeryId: z.string(),
  medications: z.array(medicationItemSchema).min(1),
  notes: z.string().optional(),
  totalCost: z.number().min(0).optional(),
});

// GET /api/post-op-prescriptions?status=&surgeryId=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!READ_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const surgeryId = searchParams.get("surgeryId");

  const where: any = {};
  if (status) where.status = status;
  if (surgeryId) where.surgeryId = surgeryId;

  const items = await prisma.postOpPrescription.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      surgery: {
        select: { id: true, procedureName: true, scheduledDate: true, surgeonName: true, location: true },
      },
    },
    take: 200,
  });
  return NextResponse.json(items.map((it) => ({ ...it, medications: safeParse(it.medications) })));
}

// POST — surgeon creates a post-op prescription for a completed surgery
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!SURGEON_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = createSchema.parse(await req.json());
    const surgery = await prisma.surgery.findUnique({
      where: { id: body.surgeryId },
      include: { patient: { select: { id: true, name: true, folderNumber: true } } },
    });
    if (!surgery) return NextResponse.json({ error: "Surgery not found" }, { status: 404 });
    if (!["COMPLETED", "IN_RECOVERY", "RECOVERY_COMPLETE"].includes(surgery.status as any)) {
      return NextResponse.json(
        { error: `Surgery must be completed before raising a post-op prescription (current status: ${surgery.status}).` },
        { status: 400 },
      );
    }

    const userId = (session.user as any).id;
    const userName = (session.user as any).fullName || (session.user as any).name || "Unknown";

    const created = await prisma.postOpPrescription.create({
      data: {
        surgeryId: surgery.id,
        patientId: surgery.patient.id,
        patientName: surgery.patient.name,
        folderNumber: surgery.patient.folderNumber || null,
        prescribedById: userId,
        prescribedByName: userName,
        medications: JSON.stringify(body.medications),
        notes: body.notes ?? null,
        totalCost: body.totalCost as any,
        status: "SENT_TO_PHARMACY",
      },
    });

    // Notify pharmacists
    try {
      const pharmacists = await prisma.user.findMany({
        where: { role: { in: ["PHARMACIST", "ADMIN", "SYSTEM_ADMINISTRATOR"] }, status: "APPROVED" },
        select: { id: true },
      });
      for (const p of pharmacists) {
        await prisma.notification.create({
          data: {
            userId: p.id,
            type: "PRESCRIPTION_RECEIVED",
            title: "New post-op prescription",
            message: `${surgery.patient.name} — ${surgery.procedureName}: ${body.medications.length} medication(s) from ${userName}.`,
            link: `/dashboard/medication-tracking?postOp=${created.id}`,
          },
        });
      }
    } catch (e) {
      console.warn("post-op pharmacy notification skipped", e);
    }

    return NextResponse.json({ ...created, medications: body.medications }, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    console.error("post-op prescription create failed", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(["RECEIVE", "START_PACKING", "PACKED", "MARK_PAID", "COLLECTED", "CANCEL"]),
  totalCost: z.number().min(0).optional(),
  packNotes: z.string().optional(),
  collectedByName: z.string().optional(),
});

// PATCH — pharmacy actions: receive → start_packing → packed (radio bill) → mark_paid (radio collect) → collected
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!PHARMACY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = patchSchema.parse(await req.json());
    const existing = await prisma.postOpPrescription.findUnique({
      where: { id: body.id },
      include: { surgery: { select: { procedureName: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const userId = (session.user as any).id;
    const userName = (session.user as any).fullName || (session.user as any).name;

    const data: any = {};
    let radioPayload: { title: string; message: string; priority: number } | null = null;

    switch (body.action) {
      case "RECEIVE":
        if (!existing.receivedAt) data.receivedAt = new Date();
        if (existing.status === "SENT_TO_PHARMACY") data.status = "PACKING";
        break;
      case "START_PACKING":
        data.status = "PACKING";
        if (!existing.receivedAt) data.receivedAt = new Date();
        break;
      case "PACKED": {
        if (existing.billAnnouncedAt) {
          return NextResponse.json({ error: "Bill already announced" }, { status: 400 });
        }
        data.status = "AWAITING_PAYMENT";
        data.packedById = userId;
        data.packedByName = userName;
        data.packedAt = new Date();
        if (body.packNotes) data.packNotes = body.packNotes;
        if (body.totalCost != null) data.totalCost = body.totalCost as any;
        data.billAnnouncedAt = new Date();
        const cost = body.totalCost ?? Number(existing.totalCost ?? 0);
        radioPayload = {
          title: "Patient — Pharmacy Bill Ready",
          message: `Patient ${existing.patientName} for ${existing.surgery?.procedureName ?? "surgery"}: please proceed to the pharmacy reception to pay your bill${cost ? ` (₦${cost.toLocaleString()})` : ""}.`,
          priority: 70,
        };
        break;
      }
      case "MARK_PAID": {
        if (existing.pickupAnnouncedAt) {
          return NextResponse.json({ error: "Pickup already announced" }, { status: 400 });
        }
        data.status = "PAID";
        data.billPaidAt = new Date();
        data.billPaidConfirmedById = userId;
        data.pickupAnnouncedAt = new Date();
        radioPayload = {
          title: "Patient — Collect Medications",
          message: `Patient ${existing.patientName}: your medications are ready. Please proceed to the pharmacy to collect.`,
          priority: 70,
        };
        break;
      }
      case "COLLECTED":
        data.status = "COLLECTED";
        data.collectedAt = new Date();
        if (body.collectedByName) data.collectedByName = body.collectedByName;
        break;
      case "CANCEL":
        data.status = "CANCELLED";
        if (body.packNotes) data.packNotes = body.packNotes;
        break;
    }

    const updated = await prisma.postOpPrescription.update({ where: { id: body.id }, data });

    if (radioPayload) {
      try {
        await triggerRadio({
          category: "WORKFLOW",
          title: radioPayload.title,
          message: radioPayload.message,
          priority: radioPayload.priority,
          urgency: "MEDIUM",
          triggeredById: userId,
          metadata: { source: "PostOpPharmacy", postOpPrescriptionId: existing.id, action: body.action },
        });
      } catch (e) {
        console.warn("radio broadcast failed", e);
      }
    }

    return NextResponse.json({ ...updated, medications: safeParse(updated.medications) });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Validation", details: e.errors }, { status: 400 });
    console.error("post-op patch failed", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function safeParse(s: string | null | undefined) {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}
