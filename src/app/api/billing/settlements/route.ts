// ============================================================
// Settlement — recording that money actually went out
// ------------------------------------------------------------
// The distribution said what each account was OWED. This records that it was
// PAID: the date, and the bank reference that proves it.
//
// No money moves through this application. Finance makes the transfer in the
// bank; this is the ledger entry that says they did, and the reference is what
// ties the two together when somebody asks six months later.
//
// A settlement is therefore a claim about the outside world, so it demands
// evidence — a reference is required, not optional. "Marked settled by
// somebody, at some point, no reference" is worse than leaving it pending: it
// looks reconciled and cannot be checked.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — what is owed, by account
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const where: Prisma.RevenueDistributionWhereInput = {
    status: (sp.get('status') as never) ?? 'PENDING',
    ...(sp.get('accountId') ? { accountId: sp.get('accountId') as string } : {}),
  };

  try {
    const rows = await prisma.revenueDistribution.findMany({
      where,
      include: {
        account: { select: { id: true, code: true, name: true, kind: true, bankName: true, accountNumber: true } },
        invoice: { select: { invoiceNumber: true, paidAt: true, patientName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });

    // Grouped by account, because that is how a transfer is actually made —
    // one payment to a vendor covering many invoices, not one per line.
    const byAccount = new Map<string, {
      accountId: string; code: string; name: string; kind: string;
      bankName: string | null; accountNumber: string | null;
      lines: number; amount: number; oldest: Date | null;
    }>();

    for (const d of rows) {
      const row = byAccount.get(d.accountId) ?? {
        accountId: d.accountId,
        code: d.account.code,
        name: d.account.name,
        kind: d.account.kind,
        bankName: d.account.bankName,
        accountNumber: d.account.accountNumber,
        lines: 0,
        amount: 0,
        oldest: null,
      };
      row.lines += 1;
      row.amount += d.amount;
      if (!row.oldest || d.createdAt < row.oldest) row.oldest = d.createdAt;
      byAccount.set(d.accountId, row);
    }

    const accounts = Array.from(byAccount.values()).sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      accounts,
      detail: rows,
      totals: {
        accounts: accounts.length,
        lines: rows.length,
        owed: accounts.reduce((s, a) => s + a.amount, 0),
        // Named so nobody has to notice it themselves: an account with no bank
        // details cannot be paid, however clearly it is owed.
        withoutBankDetails: accounts.filter((a) => !a.accountNumber).length,
      },
    });
  } catch (error) {
    console.error('[billing] settlement list failed:', error);
    return NextResponse.json({ error: 'Failed to load settlements' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — record a settlement
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: { accountId?: string; distributionIds?: string[]; reference?: string; settledAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const reference = body.reference?.trim();
  if (!reference) {
    return NextResponse.json(
      {
        error:
          'A bank or transfer reference is required. A settlement with no reference cannot be checked against the bank, which makes it worse than leaving it pending.',
        code: 'REFERENCE_REQUIRED',
      },
      { status: 400 }
    );
  }
  if (!body.accountId && !body.distributionIds?.length) {
    return NextResponse.json({ error: 'Settle which account, or which lines?' }, { status: 400 });
  }

  try {
    const where: Prisma.RevenueDistributionWhereInput = {
      status: 'PENDING',
      ...(body.distributionIds?.length
        ? { id: { in: body.distributionIds } }
        : { accountId: body.accountId as string }),
    };

    const pending = await prisma.revenueDistribution.findMany({
      where,
      select: { id: true, amount: true, accountId: true },
    });

    if (pending.length === 0) {
      return NextResponse.json(
        { error: 'There is nothing outstanding to settle here.', code: 'NOTHING_PENDING' },
        { status: 409 }
      );
    }

    const settledAt = body.settledAt ? new Date(body.settledAt) : new Date();

    const result = await prisma.revenueDistribution.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'SETTLED', settledAt, settlementRef: reference },
    });

    const total = pending.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      settled: result.count,
      amount: total,
      reference,
      settledAt,
      success: true,
    });
  } catch (error) {
    console.error('[billing] settlement failed:', error);
    return NextResponse.json({ error: 'Failed to record the settlement' }, { status: 500 });
  }
}
