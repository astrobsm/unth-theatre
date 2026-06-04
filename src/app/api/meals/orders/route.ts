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

/**
 * GET /api/meals/orders
 *
 * Managers see every order (optionally filtered by status / date / paymentStatus).
 * Non-managers only see their own orders.
 *
 * Query:
 *   - status                 (MealOrderStatus, optional)
 *   - paymentStatus          (MealPaymentStatus, optional)
 *   - date=YYYY-MM-DD        (optional — filters by createdAt day)
 *   - mine=true              (force own-orders even for managers)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const role = session.user.role as string | undefined;
    const { searchParams } = new URL(request.url);

    const where: any = {};
    if (!isManager(role) || searchParams.get("mine") === "true") {
      where.requesterId = userId;
    }

    const status = searchParams.get("status");
    if (status) where.orderStatus = status;
    const paymentStatus = searchParams.get("paymentStatus");
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const dateParam = searchParams.get("date");
    if (dateParam) {
      const start = new Date(dateParam);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    const orders = await prisma.mealOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          select: {
            id: true,
            menuItemId: true,
            nameSnapshot: true,
            categorySnapshot: true,
            availabilitySnapshot: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
            notes: true,
          },
        },
        requester: { select: { id: true, fullName: true, role: true, staffCode: true } },
        paymentVerifiedBy: { select: { id: true, fullName: true } },
        deliveredBy: { select: { id: true, fullName: true } },
      },
      take: 500,
    });

    // Hide raw payment binary in list view; expose existence as a boolean.
    const sanitised = orders.map((o) => ({
      ...o,
      paymentEvidenceData: undefined,
      hasPaymentEvidence: !!o.paymentEvidenceData,
    }));

    return NextResponse.json({ orders: sanitised });
  } catch (error) {
    console.error("[/api/meals/orders GET]", error);
    return NextResponse.json(
      { error: "Failed to load orders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meals/orders
 *
 * Body:
 *   {
 *     orderType: "FREE" | "PAID",
 *     deliveryLocation: string,
 *     deliveryNotes?: string,
 *     preferredTime?: ISO string,
 *     items: [{ menuItemId, quantity?, notes? }],
 *     // PAID only:
 *     payment?: {
 *       reference?: string,
 *       method?: string,
 *       evidence?: { fileName, mimeType, base64 }   // required for PAID
 *     }
 *   }
 *
 * For FREE orders we re-validate eligibility server-side before accepting.
 * For PAID orders we require payment evidence; status starts as
 * PENDING_VERIFICATION.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    if (!userId) {
      return NextResponse.json(
        { error: "Session missing user id" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const orderType = body?.orderType;
    const deliveryLocation = String(body?.deliveryLocation ?? "").trim();
    const items: Array<{ menuItemId: string; quantity?: number; notes?: string }> =
      Array.isArray(body?.items) ? body.items : [];

    if (orderType !== "FREE" && orderType !== "PAID") {
      return NextResponse.json(
        { error: "orderType must be FREE or PAID" },
        { status: 400 }
      );
    }
    if (!deliveryLocation) {
      return NextResponse.json(
        { error: "deliveryLocation is required" },
        { status: 400 }
      );
    }
    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one menu item is required" },
        { status: 400 }
      );
    }

    // Fetch user + menu items in parallel
    const [user, menuItems] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, role: true },
      }),
      prisma.mealMenuItem.findMany({
        where: { id: { in: items.map((i) => i.menuItemId) }, isActive: true },
      }),
    ]);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (menuItems.length !== items.length) {
      return NextResponse.json(
        { error: "One or more menu items are invalid or inactive" },
        { status: 400 }
      );
    }

    // Enforce availability vs orderType
    if (orderType === "FREE") {
      const notFree = menuItems.find(
        (m) => m.availability !== "FREE_FOR_ON_DUTY"
      );
      if (notFree) {
        return NextResponse.json(
          {
            error: `Item '${notFree.name}' is not available as a free meal`,
          },
          { status: 400 }
        );
      }
    } else {
      const notPaid = menuItems.find((m) => m.availability !== "PAID");
      if (notPaid) {
        return NextResponse.json(
          {
            error: `Item '${notPaid.name}' is a free-only item; remove it before placing a paid order`,
          },
          { status: 400 }
        );
      }
    }

    // FREE: verify eligibility (roster or surgical team today)
    let eligibilitySource: string | null = null;
    if (orderType === "FREE") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [roster, member] = await Promise.all([
        prisma.roster.findFirst({
          where: { userId, date: { gte: today, lt: tomorrow } },
          select: { id: true },
        }),
        prisma.surgicalTeamMember.findFirst({
          where: {
            userId,
            surgery: { scheduledDate: { gte: today, lt: tomorrow } },
          },
          select: { id: true },
        }),
      ]);

      if (roster) eligibilitySource = "ROSTER";
      else if (member) eligibilitySource = "SURGICAL_TEAM";
      else {
        return NextResponse.json(
          {
            error:
              "You are not eligible for a free on-duty meal today. Place a paid request instead.",
          },
          { status: 403 }
        );
      }
    }

    // PAID: require payment evidence
    let paymentEvidenceBytes: Buffer | null = null;
    if (orderType === "PAID") {
      const evid = body?.payment?.evidence;
      if (!evid?.base64 || !evid?.fileName || !evid?.mimeType) {
        return NextResponse.json(
          {
            error:
              "Payment evidence (image/PDF) is required for paid orders",
          },
          { status: 400 }
        );
      }
      try {
        paymentEvidenceBytes = Buffer.from(String(evid.base64), "base64");
      } catch {
        return NextResponse.json(
          { error: "Invalid payment evidence encoding" },
          { status: 400 }
        );
      }
      // Cap at ~5MB to keep DB rows sensible
      if (paymentEvidenceBytes.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Payment evidence must be 5 MB or smaller" },
          { status: 400 }
        );
      }
    }

    // Build line items + totals
    const lineItems = items.map((req) => {
      const menu = menuItems.find((m) => m.id === req.menuItemId)!;
      const qty = Math.max(1, Math.floor(req.quantity ?? 1));
      const unitPrice =
        orderType === "FREE" ? 0 : Number(menu.price);
      const lineTotal = unitPrice * qty;
      return {
        menuItemId: menu.id,
        nameSnapshot: menu.name,
        categorySnapshot: menu.category,
        availabilitySnapshot: menu.availability,
        unitPrice,
        quantity: qty,
        lineTotal,
        notes: req.notes ?? null,
      };
    });
    const totalAmount = lineItems.reduce((s, li) => s + li.lineTotal, 0);

    const order = await prisma.mealOrder.create({
      data: {
        requesterId: userId,
        requesterName: user.fullName,
        requesterRole: user.role,
        orderType,
        orderStatus: "PLACED",
        totalAmount,
        currency: menuItems[0]?.currency ?? "NGN",
        deliveryLocation,
        deliveryNotes: body?.deliveryNotes ?? null,
        preferredTime: body?.preferredTime
          ? new Date(body.preferredTime)
          : null,
        paymentStatus:
          orderType === "PAID" ? "PENDING_VERIFICATION" : "NOT_REQUIRED",
        paymentReference: body?.payment?.reference ?? null,
        paymentMethod: body?.payment?.method ?? null,
        paymentEvidenceFileName:
          orderType === "PAID" ? body.payment.evidence.fileName : null,
        paymentEvidenceMimeType:
          orderType === "PAID" ? body.payment.evidence.mimeType : null,
        paymentEvidenceData: paymentEvidenceBytes,
        paymentUploadedAt: orderType === "PAID" ? new Date() : null,
        eligibilitySource,
        items: { create: lineItems },
      },
      include: { items: true },
    });

    return NextResponse.json(
      {
        order: {
          ...order,
          paymentEvidenceData: undefined,
          hasPaymentEvidence: !!order.paymentEvidenceData,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/meals/orders POST]", error);
    return NextResponse.json(
      { error: "Failed to place order" },
      { status: 500 }
    );
  }
}
