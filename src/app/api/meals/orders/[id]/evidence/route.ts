import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set([
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "THEATRE_CAFETERIA_MANAGER",
]);

/**
 * GET /api/meals/orders/[id]/evidence
 *
 * Streams the payment-evidence binary (image/PDF) for a paid order.
 * Visible to the requester (own order) and to managers.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const order = await prisma.mealOrder.findUnique({
      where: { id: params.id },
      select: {
        requesterId: true,
        paymentEvidenceFileName: true,
        paymentEvidenceMimeType: true,
        paymentEvidenceData: true,
      },
    });
    if (!order || !order.paymentEvidenceData) {
      return new NextResponse("No evidence available", { status: 404 });
    }
    const manager = MANAGER_ROLES.has(session.user.role as string);
    if (!manager && order.requesterId !== userId) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    return new NextResponse(order.paymentEvidenceData as any, {
      status: 200,
      headers: {
        "Content-Type":
          order.paymentEvidenceMimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${
          order.paymentEvidenceFileName || "payment-evidence"
        }"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[/api/meals/orders/:id/evidence]", error);
    return new NextResponse("Failed to fetch evidence", { status: 500 });
  }
}
