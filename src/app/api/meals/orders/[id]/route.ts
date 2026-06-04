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
function isManager(role: string | undefined): boolean {
  return !!role && MANAGER_ROLES.has(role);
}

const VALID_STATUS = new Set([
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);
const VALID_PAYMENT = new Set([
  "NOT_REQUIRED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "REFUNDED",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const order = await prisma.mealOrder.findUnique({
      where: { id: params.id },
      include: {
        items: true,
        requester: { select: { id: true, fullName: true, role: true } },
        paymentVerifiedBy: { select: { id: true, fullName: true } },
        deliveredBy: { select: { id: true, fullName: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isManager(session.user.role) && order.requesterId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      order: {
        ...order,
        paymentEvidenceData: undefined,
        hasPaymentEvidence: !!order.paymentEvidenceData,
      },
    });
  } catch (error) {
    console.error("[/api/meals/orders/:id GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/meals/orders/[id]
 *
 * - Requester (non-manager) may only cancel an order that is still PLACED.
 * - Manager may update orderStatus, paymentStatus, paymentRejectionReason,
 *   eligibilityNotes, mark delivered (sets deliveredAt / deliveredById).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const manager = isManager(session.user.role);

    const order = await prisma.mealOrder.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        requesterId: true,
        orderStatus: true,
        paymentStatus: true,
      },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();

    // ── Requester self-service (cancel while still PLACED)
    if (!manager) {
      if (order.requesterId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        body.orderStatus === "CANCELLED" &&
        order.orderStatus === "PLACED"
      ) {
        const updated = await prisma.mealOrder.update({
          where: { id: params.id },
          data: {
            orderStatus: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason:
              body.cancellationReason ?? "Cancelled by requester",
          },
        });
        return NextResponse.json({
          order: { ...updated, paymentEvidenceData: undefined },
        });
      }
      return NextResponse.json(
        {
          error:
            "Only managers can update orders; you may cancel an order that is still PLACED",
        },
        { status: 403 }
      );
    }

    // ── Manager updates
    const data: any = {};
    if (body.orderStatus) {
      if (!VALID_STATUS.has(body.orderStatus)) {
        return NextResponse.json(
          { error: "Invalid orderStatus" },
          { status: 400 }
        );
      }
      data.orderStatus = body.orderStatus;
      const now = new Date();
      if (body.orderStatus === "CONFIRMED") data.confirmedAt = now;
      if (body.orderStatus === "PREPARING") data.preparedAt = now;
      if (body.orderStatus === "READY") data.readyAt = now;
      if (body.orderStatus === "DELIVERED") {
        data.deliveredAt = now;
        data.deliveredById = userId;
      }
      if (body.orderStatus === "CANCELLED") {
        data.cancelledAt = now;
        data.cancellationReason =
          body.cancellationReason ?? "Cancelled by manager";
      }
    }
    if (body.paymentStatus) {
      if (!VALID_PAYMENT.has(body.paymentStatus)) {
        return NextResponse.json(
          { error: "Invalid paymentStatus" },
          { status: 400 }
        );
      }
      data.paymentStatus = body.paymentStatus;
      if (body.paymentStatus === "VERIFIED") {
        data.paymentVerifiedAt = new Date();
        data.paymentVerifiedById = userId;
        data.paymentRejectionReason = null;
      }
      if (body.paymentStatus === "REJECTED") {
        data.paymentVerifiedAt = new Date();
        data.paymentVerifiedById = userId;
        data.paymentRejectionReason =
          body.paymentRejectionReason ?? "Payment evidence rejected";
      }
    }
    if ("eligibilityNotes" in body)
      data.eligibilityNotes = body.eligibilityNotes ?? null;
    if ("deliveryNotes" in body)
      data.deliveryNotes = body.deliveryNotes ?? null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No supported fields supplied" },
        { status: 400 }
      );
    }

    const updated = await prisma.mealOrder.update({
      where: { id: params.id },
      data,
      include: { items: true },
    });
    return NextResponse.json({
      order: {
        ...updated,
        paymentEvidenceData: undefined,
        hasPaymentEvidence: !!updated.paymentEvidenceData,
      },
    });
  } catch (error: any) {
    console.error("[/api/meals/orders/:id PATCH]", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}
