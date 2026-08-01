// ============================================================
// Payments — taking money, and distributing it
// ------------------------------------------------------------
// Recording a payment is the moment the revenue split becomes real. It happens
// on FULL settlement rather than on each instalment, for one reason: a split
// computed twice against a moving balance is a split that has to be unwound if
// a payment is later reversed. Distributing once, when the invoice is settled,
// gives one set of figures that either stands or is cancelled with the invoice.
//
// This is a LEDGER. No money moves through the application. ORM computes what
// each account is owed, records it, and Finance executes the transfers — which
// is why there is no payment gateway here and no credentials to protect.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { canAcceptPayment, statusAfterPayment } from '@/lib/billing/invoice';
import { distributeInvoice, ShareRule } from '@/lib/billing/revenue';
import { isEffective } from '@/lib/billing/pricing';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — payments against an invoice
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) return NextResponse.json({ error: 'Which invoice?' }, { status: 400 });

  try {
    const payments = await prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { receivedAt: 'asc' },
    });
    return NextResponse.json({
      payments,
      totals: {
        received: payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0),
        reversed: payments.filter((p) => p.reversedAt).reduce((s, p) => s + p.amount, 0),
      },
    });
  } catch (error) {
    console.error('[billing] payment list failed:', error);
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — take a payment
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: {
    invoiceId?: string;
    amount?: number;
    method?: string;
    reference?: string;
    evidenceDataUrl?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.invoiceId) return NextResponse.json({ error: 'Which invoice?' }, { status: 400 });

  // A payment queued offline must never be taken twice — that is somebody's
  // money counted against a bill they only paid once.
  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: body.invoiceId },
      include: { lines: { select: { kind: true, lineTotal: true, vendorId: true } } },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const verdict = canAcceptPayment({
      status: invoice.status as never,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      payment: body.amount as number,
    });
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
    }

    const amount = body.amount as number;
    const amountPaidAfter = invoice.amountPaid + amount;
    const nextStatus = statusAfterPayment({
      current: invoice.status as never,
      total: invoice.total,
      amountPaid: amountPaidAfter,
    });
    const settlesInvoice = nextStatus === 'PAID';

    // Only load the split rules when they are about to be used.
    let shares: ReturnType<typeof distributeInvoice> = [];

    if (settlesInvoice) {
      const [accounts, rules] = await Promise.all([
        prisma.revenueAccount.findMany({ where: { isActive: true } }),
        prisma.revenueRule.findMany({ where: { effectiveFrom: { lte: new Date() } } }),
      ]);

      // Where unruled money goes. Without a hospital account configured the
      // split cannot be computed at all, and silently skipping it would leave
      // a paid invoice with no distribution and nobody the wiser.
      const hospital = accounts.find((a) => a.kind === 'HOSPITAL');
      if (!hospital) {
        return NextResponse.json(
          {
            error:
              'No hospital revenue account is configured, so this payment cannot be distributed. Set one up under revenue accounts first.',
            code: 'NO_HOSPITAL_ACCOUNT',
          },
          { status: 409 }
        );
      }
      const live = rules.filter((r) => isEffective(r, new Date()));
      const rulesByKind: Record<string, ShareRule[]> = {};
      for (const r of live) {
        (rulesByKind[r.kind] ??= []).push({ accountId: r.accountId, shareBasisPoints: r.shareBasisPoints });
      }

      // A consignment line pays the vendor that supplied it, so its share goes
      // to that vendor's own account rather than the generic consumables rule.
      const vendorAccountByVendor = new Map<string, string>();
      for (const a of accounts) {
        if (a.kind === 'VENDOR' && a.vendorId) vendorAccountByVendor.set(a.vendorId, a.id);
      }

      shares = distributeInvoice({
        lines: invoice.lines.map((l) => ({
          kind: l.kind as string,
          lineTotal: l.lineTotal,
          vendorAccountId: l.vendorId ? (vendorAccountByVendor.get(l.vendorId) ?? null) : null,
        })),
        rulesByKind,
        fallbackAccountId: hospital.id,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          method: (body.method as never) ?? 'CASH',
          reference: body.reference?.trim() || null,
          evidenceDataUrl: body.evidenceDataUrl ?? null,
          notes: body.notes ?? null,
          receivedById: actor.userId,
          receivedByName: actor.fullName,
        },
      });

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: { increment: amount },
          status: nextStatus as never,
          ...(settlesInvoice ? { paidAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });

      if (settlesInvoice && shares.length > 0) {
        await tx.revenueDistribution.createMany({
          data: shares.map((s) => ({
            invoiceId: invoice.id,
            accountId: s.accountId,
            kind: (s.kind as never) ?? 'OTHER',
            amount: s.amount,
            shareBasisPoints: s.shareBasisPoints,
          })),
        });
      }

      return { payment, invoice: updated };
    });

    // The invariant worth stating out loud: what is distributed equals what was
    // billed. If these ever disagree the ledger is wrong, and it is better to
    // know from the response than from a reconciliation months later.
    const distributed = shares.reduce((s, x) => s + x.amount, 0);

    const payload = {
      payment: result.payment,
      invoice: { ...result.invoice, balance: Math.max(0, result.invoice.total - result.invoice.amountPaid) },
      settled: settlesInvoice,
      distribution: settlesInvoice
        ? { shares: shares.length, distributed, matchesInvoiceTotal: distributed === invoice.total }
        : null,
      success: true,
    };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('[billing] payment failed:', error);
    return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — reverse a payment
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: { id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const reason = body.reason?.trim();
  if (!body.id || !reason || reason.length < 5) {
    return NextResponse.json(
      { error: 'A payment and a reason for reversing it are required.' },
      { status: 400 }
    );
  }

  try {
    const payment = await prisma.payment.findUnique({ where: { id: body.id }, include: { invoice: true } });
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (payment.reversedAt) return NextResponse.json({ success: true, alreadyReversed: true });

    const updated = await prisma.$transaction(async (tx) => {
      // Reversed, never deleted: a payment that disappears leaves a hole in the
      // day's takings that nobody can explain.
      await tx.payment.update({
        where: { id: payment.id },
        data: { reversedAt: new Date(), reversalReason: reason },
      });

      const amountPaidAfter = payment.invoice.amountPaid - payment.amount;

      // A distribution computed on settlement no longer holds once the money
      // that settled it has been taken back.
      const cancelled = await tx.revenueDistribution.updateMany({
        where: { invoiceId: payment.invoiceId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      const invoice = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: { decrement: payment.amount },
          status: statusAfterPayment({
            current: payment.invoice.status === 'PAID' ? 'ISSUED' : (payment.invoice.status as never),
            total: payment.invoice.total,
            amountPaid: amountPaidAfter,
          }) as never,
          paidAt: null,
          version: { increment: 1 },
        },
      });

      return { invoice, cancelledDistributions: cancelled.count };
    });

    return NextResponse.json({
      invoice: updated.invoice,
      cancelledDistributions: updated.cancelledDistributions,
      success: true,
    });
  } catch (error) {
    console.error('[billing] payment reversal failed:', error);
    return NextResponse.json({ error: 'Failed to reverse the payment' }, { status: 500 });
  }
}
