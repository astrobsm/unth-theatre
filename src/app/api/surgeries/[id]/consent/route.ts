import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/surgeries/[id]/consent — streams the uploaded consent file
// Visible to: Holding-area nurses, surgeons, anaesthetists, theatre managers, admins.
const ALLOWED_ROLES = [
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "RECOVERY_ROOM_NURSE",
  "SCRUB_NURSE",
  "ANAESTHETIST",
  "CONSULTANT_ANAESTHETIST",
  "ANAESTHETIC_TECHNICIAN",
  "SURGEON",
  "HOUSE_OFFICER",
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const surgery = await prisma.surgery.findUnique({
    where: { id: params.id },
    select: { consentFileName: true, consentFileMimeType: true, consentFileData: true },
  });
  if (!surgery?.consentFileData) {
    return NextResponse.json({ error: "No consent file uploaded" }, { status: 404 });
  }
  const buffer = Buffer.from(surgery.consentFileData, "base64");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": surgery.consentFileMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${(surgery.consentFileName || "consent").replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

// HEAD — lightweight presence check used by the UI to avoid noisy 404s
export async function HEAD(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse(null, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role)) return new NextResponse(null, { status: 403 });
  const surgery = await prisma.surgery.findUnique({
    where: { id: params.id },
    select: { consentFileMimeType: true, consentFileData: true },
  });
  if (!surgery?.consentFileData) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 200,
    headers: { "Content-Type": surgery.consentFileMimeType || "application/octet-stream" },
  });
}
