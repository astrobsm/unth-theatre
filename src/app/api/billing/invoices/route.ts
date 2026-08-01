// ============================================================
// Invoices — generate one bill for one surgery, and issue it
// ------------------------------------------------------------
// Generation reads what the case actually consumed and prices it from what was
// agreed at reservation; fees come from the effective-dated tariff catalogue.
// None of that arithmetic happens here — lib/billing/invoice does it, so what
// lands on a bill can be tested without a database.
//
// One invoice per surgery is enforced by a unique index on invoices.surgeryId,
// so the race between two clerks generating at once is settled by Postgres
// rather than by a check-then-insert that can lose.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { buildInvoice, ChargeKindValue, FeeRequest, isInvoiceLocked } from '@/lib/billing/invoice';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const INVOICE_INCLUDE = {
  lines: { orderBy: { createdAt: 'asc' }, include: { vendor: { select: { id: true, name: true } } } },
  payments: { where: { reversedAt: null }, orderBy: { receivedAt: 'asc' } },
  distributions: { include: { account: { select: { id: true, code: true, name: true, kind: true } } } },
} satisfies Prisma.InvoiceInclude;

/**
 * Which charge kind a consumed item belongs under. Drives how the line is
 * routed when revenue is split, so it follows the catalogue category rather
 * than being guessed per line.
 */
function chargeKindForCategory(category: string | null | undefined): ChargeKindValue {
  switch (category) {
    case 'CONSUMABLE':
      return 'CONSUMABLE';
    case 'MACHINE':
    case 'DEVICE':
      return 'IMPLANT';
    default:
      return 'OTHER';
  }
}

// ---------------------------------------------------------------------------
// GET — one invoice, or the register
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const id = sp.get('id');
  const surgeryId = sp.get('surgeryId');

  try {
    if (id || surgeryId) {
      const invoice = await prisma.invoice.findFirst({
        where: { ...(id ? { id } : { surgeryId: surgeryId as string }), deletedAt: null },
        include: INVOICE_INCLUDE,
      });
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      return NextResponse.json({
        invoice: { ...invoice, balance: Math.max(0, invoice.total - invoice.amountPaid) },
      });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        ...(sp.get('status') ? { status: sp.get('status') as never } : {}),
        ...(sp.get('patientId') ? { patientId: sp.get('patientId') as string } : {}),
      },
      include: { _count: { select: { lines: true, payments: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Number(sp.get('limit') ?? 100) || 100),
    });

    return NextResponse.json({
      invoices: invoices.map((i) => ({ ...i, balance: Math.max(0, i.total - i.amountPaid) })),
      totals: {
        count: invoices.length,
        billed: invoices.reduce((s, i) => s + i.total, 0),
        paid: invoices.reduce((s, i) => s + i.amountPaid, 0),
        outstanding: invoices.reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0),
      },
    });
  } catch (error) {
    console.error('[billing] invoice read failed:', error);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — generate the invoice for a surgery
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: {
    surgeryId?: string;
    fees?: FeeRequest[];
    discount?: number;
    discountReason?: string;
    taxBasisPoints?: number;
    /** Regenerate a draft that is already there, rather than refusing. */
    regenerate?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const surgeryId = body.surgeryId;
  if (!surgeryId) return NextResponse.json({ error: 'Which surgery?' }, { status: 400 });

  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true,
        createdAt: true,
        patient: { select: { id: true, name: true } },
      },
    });
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    const existing = await prisma.invoice.findUnique({
      where: { surgeryId },
      select: { id: true, status: true, invoiceNumber: true },
    });

    if (existing && !body.regenerate) {
      return NextResponse.json(
        {
          error: `${existing.invoiceNumber} already exists for this surgery. One surgery carries one invoice.`,
          code: 'INVOICE_EXISTS',
          invoiceId: existing.id,
        },
        { status: 409 }
      );
    }
    if (existing && body.regenerate && existing.status !== 'DRAFT') {
      // Regenerating an issued bill would change what a patient has already
      // been told to pay.
      return NextResponse.json(
        {
          error: `${existing.invoiceNumber} has already been issued and cannot be regenerated. Cancel it and raise a new one.`,
          code: 'INVOICE_ISSUED',
        },
        { status: 409 }
      );
    }

    // What the case actually consumed. Only reservations with something used
    // reach the bill; the builder drops the rest.
    const reservations = await prisma.stockReservation.findMany({
      where: { surgeryId },
      include: {
        batch: {
          select: {
            batchNumber: true,
            owner: true,
            vendorId: true,
            item: { select: { name: true, category: true } },
          },
        },
      },
    });

    const tariffs = await prisma.tariff.findMany({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });

    const draft = buildInvoice({
      reservations: reservations.map((r) => ({
        id: r.id,
        quantityUsed: r.quantityUsed,
        unitPriceAtReservation: r.unitPriceAtReservation,
        itemName: r.batch.item.name,
        batchNumber: r.batch.batchNumber,
        chargeKind: chargeKindForCategory(r.batch.item.category),
        // Only consignment lines carry a vendor: hospital-owned stock is not
        // owed to anybody.
        vendorId: r.batch.owner === 'VENDOR' ? r.batch.vendorId : null,
      })),
      fees: body.fees ?? [],
      tariffs: tariffs.map((t) => ({ ...t, kind: t.kind as string })),
      asOf: new Date(),
      discount: body.discount ?? 0,
      taxBasisPoints: body.taxBasisPoints ?? 0,
    });

    const invoice = await prisma.$transaction(async (tx) => {
      if (existing) {
        // Replacing a draft: its lines go, the invoice keeps its number.
        await tx.invoiceLine.deleteMany({ where: { invoiceId: existing.id } });
      }

      const year = new Date().getFullYear();
      const seq = await tx.invoice.count({ where: { invoiceNumber: { startsWith: `INV/${year}/` } } });
      const invoiceNumber = existing?.invoiceNumber ?? `INV/${year}/${String(seq + 1).padStart(5, '0')}`;

      const data = {
        invoiceNumber,
        surgeryId,
        patientId: surgery.patient?.id ?? null,
        patientName: surgery.patient?.name ?? null,
        subtotal: draft.subtotal,
        discount: draft.discount,
        discountReason: body.discountReason ?? null,
        tax: draft.tax,
        total: draft.total,
        createdById: actor.userId,
        lines: {
          create: draft.lines.map((l) => ({
            kind: l.kind as never,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            sourceKind: l.sourceKind,
            sourceId: l.sourceId,
            tariffId: l.tariffId,
            vendorId: l.vendorId,
          })),
        },
      };

      return existing
        ? tx.invoice.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
            include: INVOICE_INCLUDE,
          })
        : tx.invoice.create({ data, include: INVOICE_INCLUDE });
    });

    const payload = {
      invoice,
      // Surfaced, never swallowed: a fee with no price in force means the
      // hospital is about to not charge for something.
      unpriced: draft.unpriced,
      success: true,
    };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'An invoice for this surgery was created a moment ago.', code: 'INVOICE_EXISTS' },
        { status: 409 }
      );
    }
    console.error('[billing] invoice generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate the invoice' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — issue or cancel
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { id?: string; action?: 'ISSUE' | 'CANCEL'; reason?: string; dueAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'An invoice and an action are required.' }, { status: 400 });
  }

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: body.id } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (isInvoiceLocked(invoice.status as never)) {
      return NextResponse.json(
        {
          error: `This invoice is ${invoice.status.toLowerCase()} and can no longer be changed. Raise a credit note instead.`,
          code: 'INVOICE_LOCKED',
        },
        { status: 409 }
      );
    }

    if (body.action === 'ISSUE') {
      if (invoice.status !== 'DRAFT') {
        return NextResponse.json({ error: 'Only a draft invoice can be issued.' }, { status: 409 });
      }
      if (invoice.total <= 0) {
        // An issued bill for nothing is a bill nobody can pay and everybody has
        // to explain.
        return NextResponse.json(
          { error: 'This invoice totals zero. Add what is being charged for before issuing it.', code: 'EMPTY_INVOICE' },
          { status: 409 }
        );
      }

      const issued = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'ISSUED',
          issuedAt: new Date(),
          issuedById: actor.userId,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          version: { increment: 1 },
        },
        include: INVOICE_INCLUDE,
      });
      return NextResponse.json({ invoice: issued, success: true });
    }

    const reason = body.reason?.trim();
    if (!reason || reason.length < 5) {
      return NextResponse.json(
        { error: 'State why this invoice is being cancelled.' },
        { status: 400 }
      );
    }
    if (invoice.amountPaid > 0) {
      return NextResponse.json(
        {
          error: 'Money has already been received against this invoice. Reverse the payments before cancelling it.',
          code: 'HAS_PAYMENTS',
        },
        { status: 409 }
      );
    }

    const cancelled = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, version: { increment: 1 } },
      include: INVOICE_INCLUDE,
    });
    return NextResponse.json({ invoice: cancelled, success: true });
  } catch (error) {
    console.error('[billing] invoice update failed:', error);
    return NextResponse.json({ error: 'Failed to update the invoice' }, { status: 500 });
  }
}
