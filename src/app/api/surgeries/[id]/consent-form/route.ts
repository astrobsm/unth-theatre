import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { clearanceFor } from "@/lib/preopVisitClearance";

export const dynamic = "force-dynamic";

/**
 * Roles allowed to view / complete a patient's surgical consent form.
 *
 * CONSULTANT_SURGEON was missing. SURGEON was here and its consultant grade was
 * not, so the senior surgeon who most often takes consent was the one person
 * refused — a 403 on the morning's list, with nothing on screen explaining why.
 * Every other pairing in this list carries both grades: ANAESTHETIST sits beside
 * CONSULTANT_ANAESTHETIST, and this one had been left half-written.
 *
 * THEATRE_CHAIRMAN is added on the same principle, as the grade above
 * THEATRE_MANAGER, which was already here.
 *
 * Deliberately NOT widened further. Consent is a clinical act, and the roles
 * that cannot take it — porters, cleaners, pharmacy, stores, engineering —
 * stay out.
 */
const ALLOWED_ROLES = [
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "THEATRE_CHAIRMAN",
  "SURGEON",
  "CONSULTANT_SURGEON",
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

  /**
   * Recording consent here also clears it as a blocker on the pre-operative
   * visit, so the patient can be called for the morning list.
   *
   * The visit is what call-for-patient reads: a visit sitting at NOT_CLEARED
   * stops the patient being sent for. A nurse who found no consent in the
   * folder yesterday correctly recorded NOT_OBTAINED — and nothing re-examined
   * that when the consent was taken afterwards, so a signed consent sat on the
   * case while the ward was told the patient was not cleared.
   *
   * Only the newest visit is touched, only its consent flag, and the status is
   * recomputed from the visit's OWN stored facts — so any OTHER reason it was
   * held back (unpaid fee, not fasted, no anaesthetic review) still holds it
   * back. This clears consent, not the visit.
   *
   * A REFUSED consent is never overwritten: that is the patient's decision.
   *
   * Best-effort. A consent that was recorded must not fail because a visit row
   * could not be updated.
   */
  try {
    const visit = await prisma.preOperativeVisit.findFirst({
      where: { surgeryId: params.id },
      orderBy: { createdAt: 'desc' },
    });
    if (visit && visit.consentStatus !== 'OBTAINED' && visit.consentStatus !== 'REFUSED') {
      const next = clearanceFor({ ...visit, consentStatus: 'OBTAINED' }, true);
      await prisma.preOperativeVisit.update({
        where: { id: visit.id },
        data: {
          consentStatus: 'OBTAINED',
          overallStatus: next as any,
          consentNotes: [visit.consentNotes, `Consent recorded by ${user.name} in the app.`]
            .filter(Boolean)
            .join(' '),
        },
      });
    }
  } catch (e) {
    console.error('[consent-form] could not refresh pre-operative visit clearance:', e);
  }

  return NextResponse.json({ ok: true });
}
