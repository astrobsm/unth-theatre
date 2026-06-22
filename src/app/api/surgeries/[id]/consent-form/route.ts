import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Roles allowed to view / complete a patient's surgical consent form.
const ALLOWED_ROLES = [
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "SURGEON",
  "HOUSE_OFFICER",
  "ANAESTHETIST",
  "CONSULTANT_ANAESTHETIST",
  "ANAESTHETIC_TECHNICIAN",
  "SCRUB_NURSE",
  "CIRCULATING_NURSE",
  "RECOVERY_ROOM_NURSE",
];

function getUser(session: any) {
  const u = session?.user;
  return u ? { id: u.id as string, role: u.role as string, name: (u.fullName || u.name) as string } : null;
}

// GET /api/surgeries/[id]/consent-form
// Returns the saved structured consent form (if any) plus patient/surgery basics for prefill.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = getUser(session);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const surgery = await prisma.surgery.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      procedureName: true,
      indication: true,
      surgeonName: true,
      surgeryType: true,
      consentFormData: true,
      consentSignedElectronically: true,
      consentCompletedAt: true,
      consentFileName: true,
      consentFileMimeType: true,
      consentUploadedAt: true,
      patient: { select: { id: true, name: true, folderNumber: true, age: true, ageUnit: true, gender: true, ward: true } },
    },
  });
  if (!surgery) return NextResponse.json({ error: "Surgery not found" }, { status: 404 });

  let form: any = null;
  if (surgery.consentFormData) {
    try { form = JSON.parse(surgery.consentFormData); } catch { form = null; }
  }

  return NextResponse.json({
    surgery: {
      id: surgery.id,
      procedureName: surgery.procedureName,
      indication: surgery.indication,
      surgeonName: surgery.surgeonName,
      surgeryType: surgery.surgeryType,
      patient: surgery.patient,
    },
    form,
    signedElectronically: surgery.consentSignedElectronically,
    completedAt: surgery.consentCompletedAt,
    hasHardCopy: !!surgery.consentFileName,
    hardCopyName: surgery.consentFileName,
    hardCopyMimeType: surgery.consentFileMimeType,
    hardCopyUploadedAt: surgery.consentUploadedAt,
  });
}

// POST /api/surgeries/[id]/consent-form
// Saves the structured consent form. Body:
//   { form: {...}, mode: 'ELECTRONIC' | 'UPLOAD',
//     hardCopyFile?: { name, mimeType, base64 } }  // generated PDF or uploaded scan
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = getUser(session);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const surgery = await prisma.surgery.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!surgery) return NextResponse.json({ error: "Surgery not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const mode = body?.mode === "UPLOAD" ? "UPLOAD" : "ELECTRONIC";
  const form = body?.form ?? null;

  const data: any = {
    consentFormData: form ? JSON.stringify(form) : null,
    consentSignedElectronically: mode === "ELECTRONIC",
    consentCompletedAt: new Date(),
  };

  // Store the hard-copy (generated PDF or uploaded signed scan) in the existing
  // consentFile* columns so the holding-area viewer & download endpoint pick it up.
  const hc = body?.hardCopyFile;
  if (hc && typeof hc.base64 === "string" && hc.base64.length > 0) {
    data.consentFileName = hc.name || "consent.pdf";
    data.consentFileMimeType = hc.mimeType || "application/pdf";
    data.consentFileData = hc.base64.includes(",") ? hc.base64.split(",").pop() : hc.base64;
    data.consentUploadedAt = new Date();
    data.consentUploadedById = user.id;
  }

  await prisma.surgery.update({ where: { id: params.id }, data });

  return NextResponse.json({ ok: true });
}
