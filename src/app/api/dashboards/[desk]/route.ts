// ============================================================
// Per-role desks
// ------------------------------------------------------------
// Four read-only summaries: what needs THIS person today.
//
// One route rather than four because the expensive part — session, role,
// imprest duty lookup, access decision — is identical for all of them, and
// four copies of it would drift. The bodies below share nothing else.
//
// Nothing here writes. Every figure is traceable to a screen that already
// exists, and each stat carries the href of the page that explains it, so a
// desk is a way in rather than a second version of the truth.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { formatNaira } from '@/lib/imprest/money';
import { scheduledInstant } from '@/lib/theatreOps/clock';
import { timingsFor } from '@/lib/theatreOps/durations';
import { onTimePercent } from '@/lib/theatreOps/durations';
import { readiness, summarise as summariseTeam } from '@/lib/theatreOps/checkIn';
import {
  canOpenDesk,
  daysUntil,
  expiryOrder,
  isDesk,
  percentOf,
  type Desk,
  type DeskStat,
} from '@/lib/dashboards/desks';

export const dynamic = 'force-dynamic';

/** Start of today and the end of the window, in whole days. */
function window(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end: new Date(start.getTime() + days * 86_400_000) };
}

export async function GET(request: NextRequest, { params }: { params: { desk: string } }) {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; role?: string; fullName?: string } | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  if (!isDesk(params.desk)) {
    return NextResponse.json({ error: 'Unknown desk' }, { status: 404 });
  }
  const desk: Desk = params.desk;

  // Only looked up when it could matter — the finance desk is the sole one
  // that admits people by an imprest duty rather than an ORM role.
  let imprestRoles: string[] = [];
  if (desk === 'finance') {
    try {
      const rows = await prisma.imprestRoleAssignment.findMany({
        where: { userId: me.id, isActive: true, revokedAt: null },
        select: { role: true },
      });
      imprestRoles = rows.map((r) => r.role as string);
    } catch {
      // A failed lookup must not grant access, and must not 500 either.
      imprestRoles = [];
    }
  }

  if (!canOpenDesk(desk, me.role, imprestRoles)) {
    return NextResponse.json({ error: 'This desk is not for your role.' }, { status: 403 });
  }

  try {
    switch (desk) {
      case 'consultant':
        return NextResponse.json(await consultantDesk(me.id));
      case 'inventory':
        return NextResponse.json(await inventoryDesk());
      case 'vendor':
        return NextResponse.json(await vendorDesk());
      case 'finance':
        return NextResponse.json(await financeDesk());
    }
  } catch (error) {
    console.error(`[desks] ${desk} failed:`, error);
    return NextResponse.json({ error: 'Failed to build this desk' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Consultant — my practice
// ---------------------------------------------------------------------------
// Deliberately MY cases only. A surgeon may look at their own punctuality;
// showing them a league table of their colleagues' is the thing the whole
// operations module was built to avoid.
// ---------------------------------------------------------------------------
async function consultantDesk(userId: string) {
  const { start } = window(0);
  const weekEnd = new Date(start.getTime() + 7 * 86_400_000);
  const ninetyDaysAgo = new Date(start.getTime() - 90 * 86_400_000);

  const mine = {
    OR: [
      { surgeonId: userId },
      { assistantSurgeonId: userId },
      { anesthetistId: userId },
      { supervisingConsultantId: userId },
      { teamMembers: { some: { userId } } },
    ],
  };

  const [upcoming, past] = await Promise.all([
    prisma.surgery.findMany({
      where: { ...mine, scheduledDate: { gte: start, lt: weekEnd }, status: { notIn: ['CANCELLED'] } },
      select: {
        id: true, procedureName: true, scheduledDate: true, scheduledTime: true, status: true,
        location: true, unit: true, surgeryType: true, readinessStatus: true,
        recentHb: true, hbSampleAt: true, bleedingRiskLevel: true,
        consentCompletedAt: true, consentUploadedAt: true,
        patient: { select: { name: true, folderNumber: true, ward: true } },
        surgeonId: true, assistantSurgeonId: true, anesthetistId: true, supervisingConsultantId: true,
        scrubNurseId: true, theatreTechnicianId: true, supervisingConsultantName: true,
        teamMembers: { select: { userId: true, memberName: true, role: true } },
        teamCheckIns: { select: { userId: true, status: true } },
        preopAlert: { select: { sentAt: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
      take: 60,
    }),
    prisma.surgery.findMany({
      where: { ...mine, scheduledDate: { gte: ninetyDaysAgo, lt: start }, status: { notIn: ['CANCELLED'] } },
      select: {
        id: true, scheduledDate: true, scheduledTime: true,
        movements: { select: { phase: true, timestamp: true } },
      },
      take: 500,
    }),
  ]);

  const timings = past.map((s) =>
    timingsFor({
      movements: s.movements.map((m) => ({ phase: m.phase as never, timestamp: m.timestamp })),
      scheduledStart: scheduledInstant(s.scheduledDate, s.scheduledTime),
    })
  );
  const onTime = onTimePercent(timings);

  const today = upcoming.filter(
    (s) => s.scheduledDate >= start && s.scheduledDate < new Date(start.getTime() + 86_400_000)
  );

  const cases = upcoming.map((s) => {
    const slots = [
      { userId: s.surgeonId, roleOnCase: 'Surgeon' },
      { userId: s.assistantSurgeonId, roleOnCase: 'Assistant Surgeon' },
      { userId: s.anesthetistId, roleOnCase: 'Anaesthetist' },
      { userId: s.scrubNurseId, roleOnCase: 'Scrub Nurse' },
      { userId: s.theatreTechnicianId, roleOnCase: 'Anaesthetic Technician' },
      { userId: s.supervisingConsultantId, roleOnCase: 'Supervising Consultant' },
      ...s.teamMembers.map((m) => ({ userId: m.userId, roleOnCase: m.role })),
    ].filter((x): x is { userId: string; roleOnCase: string } => !!x.userId);

    const byUser = new Map(s.teamCheckIns.map((c) => [c.userId, c.status]));
    const team = readiness(
      slots.map((x) => ({
        userId: x.userId,
        name: null,
        roleOnCase: x.roleOnCase,
        status: (byUser.get(x.userId) as never) ?? null,
      }))
    );

    // The things that stop a case at the door, in the order they bite.
    const outstanding: string[] = [];
    if (!s.consentCompletedAt && !s.consentUploadedAt) outstanding.push('Consent');
    if (s.recentHb === null) outstanding.push('Haemoglobin');
    if (!s.bleedingRiskLevel) outstanding.push('Bleeding risk');
    if (s.readinessStatus === 'PENDING_DEPOSIT') outstanding.push('Deposit');
    if (s.readinessStatus === 'BLOCKED') outstanding.push('Blocked');

    return {
      id: s.id,
      procedureName: s.procedureName,
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      theatre: s.location,
      unit: s.unit,
      surgeryType: s.surgeryType,
      patientName: s.patient?.name ?? null,
      folderNumber: s.patient?.folderNumber ?? null,
      ward: s.patient?.ward ?? null,
      readinessStatus: s.readinessStatus,
      outstanding,
      teamSummary: summariseTeam(team),
      teamReady: team.ready,
      alerted: !!s.preopAlert,
    };
  });

  const needingAttention = cases.filter((c) => c.outstanding.length > 0);

  const stats: DeskStat[] = [
    { label: 'Cases today', value: today.length, href: '/dashboard/surgeries' },
    { label: 'Next seven days', value: upcoming.length, href: '/dashboard/surgeries' },
    {
      label: 'Needing something',
      value: needingAttention.length,
      hint: 'Consent, labs, deposit or a block',
      tone: needingAttention.length ? 'alert' : 'good',
    },
    {
      label: 'Your on-time starts',
      value: onTime.percent === null ? '—' : `${onTime.percent}%`,
      hint:
        onTime.assessed === 0
          ? 'No case in 90 days has the milestones recorded'
          : `${onTime.assessed} of ${onTime.total} cases assessable`,
      tone: 'neutral',
      href: '/dashboard/theatre-ops/performance',
    },
  ];

  return {
    desk: 'consultant',
    stats,
    cases,
    needingAttention,
    // Stated plainly rather than left for someone to infer from a dash.
    onTime: { ...onTime, note: 'Your own cases only. Nobody else sees this figure.' },
  };
}

// ---------------------------------------------------------------------------
// Inventory officer
// ---------------------------------------------------------------------------
async function inventoryDesk() {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const { start } = window(0);

  const [batches, openReservations, todaysMovements, lowItems] = await Promise.all([
    prisma.stockBatch.findMany({
      where: { quantityReceived: { gt: 0 } },
      select: {
        id: true, batchNumber: true, expiryDate: true, owner: true,
        quantityReceived: true, quantityIssued: true, quantityReturned: true,
        quantityExpired: true, quantityDisposed: true, purchasePrice: true, sellingPrice: true,
        item: { select: { name: true, category: true, reorderLevel: true } },
        vendor: { select: { name: true } },
      },
      take: 3000,
    }),
    prisma.stockReservation.count({ where: { status: { in: ['RESERVED', 'ISSUED'] } } }),
    prisma.stockMovement.count({ where: { occurredAt: { gte: start } } }),
    prisma.inventoryItem.findMany({
      where: { quantity: { lte: prisma.inventoryItem.fields.reorderLevel } },
      select: { id: true, name: true, quantity: true, reorderLevel: true, category: true },
      orderBy: { quantity: 'asc' },
      take: 50,
    }),
  ]);

  const onHandOf = (b: (typeof batches)[number]) =>
    b.quantityReceived + b.quantityReturned - b.quantityIssued - b.quantityExpired - b.quantityDisposed;

  const withStock = batches.filter((b) => onHandOf(b) > 0);
  const expired = withStock.filter((b) => b.expiryDate && b.expiryDate < now);
  const expiringSoon = withStock.filter(
    (b) => b.expiryDate && b.expiryDate >= now && b.expiryDate <= in30
  );

  const stockValue = withStock.reduce((sum, b) => sum + onHandOf(b) * b.purchasePrice, 0);
  const consignmentValue = withStock
    .filter((b) => b.owner === 'VENDOR')
    .reduce((sum, b) => sum + onHandOf(b) * b.purchasePrice, 0);

  const shape = (b: (typeof batches)[number]) => ({
    id: b.id,
    item: b.item.name,
    category: b.item.category,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate,
    daysLeft: daysUntil(b.expiryDate, now),
    onHand: onHandOf(b),
    owner: b.owner,
    vendor: b.vendor?.name ?? null,
    value: onHandOf(b) * b.purchasePrice,
  });

  const stats: DeskStat[] = [
    {
      label: 'Stock on hand',
      value: formatNaira(stockValue),
      hint: `${withStock.length} batches · ${formatNaira(consignmentValue)} on consignment`,
      href: '/dashboard/theatre-supply',
    },
    {
      label: 'Expired, still on the shelf',
      value: expired.length,
      hint: 'Dispose and write off',
      tone: expired.length ? 'alert' : 'good',
      href: '/dashboard/theatre-supply/reports',
    },
    {
      label: 'Expiring within 30 days',
      value: expiringSoon.length,
      tone: expiringSoon.length ? 'warn' : 'good',
      href: '/dashboard/theatre-supply/reports',
    },
    {
      label: 'At or below reorder level',
      value: lowItems.length,
      tone: lowItems.length ? 'warn' : 'good',
      href: '/dashboard/inventory',
    },
    { label: 'Open reservations', value: openReservations, href: '/dashboard/theatre-supply' },
    { label: 'Movements today', value: todaysMovements, href: '/dashboard/theatre-supply' },
  ];

  return {
    desk: 'inventory',
    stats,
    expired: expiryOrder(expired, now).slice(0, 25).map(shape),
    expiringSoon: expiryOrder(expiringSoon, now).slice(0, 25).map(shape),
    lowItems,
  };
}

// ---------------------------------------------------------------------------
// Vendor accounts — the hospital's view of what it owes outside parties
// ---------------------------------------------------------------------------
async function vendorDesk() {
  const now = new Date();

  const [vendors, batches, pending, settled] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, phone: true, bankName: true, accountNumber: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
    prisma.stockBatch.findMany({
      where: { owner: 'VENDOR', vendorId: { not: null } },
      select: {
        vendorId: true, expiryDate: true, purchasePrice: true,
        quantityReceived: true, quantityIssued: true, quantityReturned: true,
        quantityExpired: true, quantityDisposed: true,
      },
      take: 5000,
    }),
    prisma.revenueDistribution.findMany({
      where: { status: 'PENDING' },
      select: { amount: true, account: { select: { id: true, name: true, kind: true, vendorId: true } } },
      take: 5000,
    }),
    prisma.revenueDistribution.findMany({
      where: { status: 'SETTLED' },
      select: {
        amount: true, settledAt: true, settlementRef: true,
        account: { select: { name: true, vendorId: true } },
      },
      orderBy: { settledAt: 'desc' },
      take: 50,
    }),
  ]);

  const onHandOf = (b: (typeof batches)[number]) =>
    b.quantityReceived + b.quantityReturned - b.quantityIssued - b.quantityExpired - b.quantityDisposed;

  const rows = vendors.map((v) => {
    const theirs = batches.filter((b) => b.vendorId === v.id);
    const onConsignment = theirs.reduce((s, b) => s + onHandOf(b) * b.purchasePrice, 0);
    const expiredUnits = theirs
      .filter((b) => b.expiryDate && b.expiryDate < now)
      .reduce((s, b) => s + onHandOf(b), 0);
    const owed = pending
      .filter((d) => d.account?.vendorId === v.id)
      .reduce((s, d) => s + d.amount, 0);

    return {
      id: v.id,
      name: v.name,
      phone: v.phone,
      bankName: v.bankName,
      // Never the full number on a summary screen. The settlement page shows
      // it to the person actually making a transfer.
      accountLast4: v.accountNumber ? v.accountNumber.slice(-4) : null,
      batches: theirs.length,
      onConsignment,
      onConsignmentLabel: formatNaira(onConsignment),
      expiredUnits,
      owed,
      owedLabel: formatNaira(owed),
    };
  });

  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  const totalConsignment = rows.reduce((s, r) => s + r.onConsignment, 0);
  // Distributions to accounts with no vendor attached — hospital shares and
  // anything mis-configured. Shown because a silent remainder is how a
  // reconciliation goes wrong.
  const unattributed = pending
    .filter((d) => !d.account?.vendorId)
    .reduce((s, d) => s + d.amount, 0);

  const stats: DeskStat[] = [
    { label: 'Active vendors', value: rows.length },
    {
      label: 'Owed to vendors',
      value: formatNaira(totalOwed),
      hint: 'Pending settlement',
      tone: totalOwed ? 'warn' : 'good',
      href: '/dashboard/theatre-billing',
    },
    {
      label: 'Vendor stock held',
      value: formatNaira(totalConsignment),
      hint: 'Consignment, not yet used',
    },
    {
      label: 'Not attributed to a vendor',
      value: formatNaira(unattributed),
      hint: 'Hospital shares and anything unassigned',
    },
  ];

  return {
    desk: 'vendor',
    stats,
    vendors: rows.sort((a, b) => b.owed - a.owed),
    recentSettlements: settled.map((s) => ({
      account: s.account?.name ?? 'Unknown account',
      amount: s.amount,
      amountLabel: formatNaira(s.amount),
      settledAt: s.settledAt,
      reference: s.settlementRef,
    })),
  };
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
async function financeDesk() {
  const { start } = window(0);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);

  const [invoices, paymentsToday, monthPayments, pendingDistributions] = await Promise.all([
    prisma.invoice.findMany({
      where: { deletedAt: null },
      select: {
        id: true, invoiceNumber: true, status: true, total: true, amountPaid: true,
        issuedAt: true, dueAt: true, paidAt: true, patientName: true,
        surgery: { select: { procedureName: true, unit: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.payment.aggregate({
      where: { receivedAt: { gte: start }, reversedAt: null },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { receivedAt: { gte: monthStart }, reversedAt: null },
      _sum: { amount: true },
    }),
    prisma.revenueDistribution.groupBy({
      by: ['accountId'],
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const open = invoices.filter((i) => !['PAID', 'CANCELLED'].includes(i.status));
  const outstanding = open.reduce((s, i) => s + (i.total - i.amountPaid), 0);
  const overdue = open.filter((i) => i.dueAt && i.dueAt < start);

  const accountIds = pendingDistributions.map((d) => d.accountId);
  const accounts = accountIds.length
    ? await prisma.revenueAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true, code: true, kind: true },
      })
    : [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const byStatus = invoices.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  const pendingTotal = pendingDistributions.reduce((s, d) => s + (d._sum.amount ?? 0), 0);
  const collected = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const billed = invoices.reduce((s, i) => s + i.total, 0);

  const stats: DeskStat[] = [
    {
      label: 'Outstanding',
      value: formatNaira(outstanding),
      hint: `${open.length} unpaid invoices`,
      tone: outstanding ? 'warn' : 'good',
      href: '/dashboard/theatre-billing',
    },
    {
      label: 'Overdue',
      value: overdue.length,
      hint: 'Past their due date',
      tone: overdue.length ? 'alert' : 'good',
      href: '/dashboard/theatre-billing',
    },
    {
      label: 'Taken today',
      value: formatNaira(paymentsToday._sum.amount ?? 0),
      hint: `${paymentsToday._count} payments`,
      tone: 'good',
    },
    { label: 'Taken this month', value: formatNaira(monthPayments._sum.amount ?? 0) },
    {
      label: 'Awaiting settlement',
      value: formatNaira(pendingTotal),
      hint: `${pendingDistributions.length} accounts`,
      tone: pendingTotal ? 'warn' : 'good',
      href: '/dashboard/theatre-billing',
    },
    {
      label: 'Collection rate',
      value: percentOf(collected, billed) === null ? '—' : `${percentOf(collected, billed)}%`,
      hint: `${formatNaira(collected)} of ${formatNaira(billed)} billed`,
    },
  ];

  return {
    desk: 'finance',
    stats,
    byStatus,
    overdue: overdue.slice(0, 25).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      patientName: i.patientName,
      procedure: i.surgery?.procedureName ?? null,
      unit: i.surgery?.unit ?? null,
      balance: i.total - i.amountPaid,
      balanceLabel: formatNaira(i.total - i.amountPaid),
      dueAt: i.dueAt,
      daysOverdue: i.dueAt ? -(daysUntil(i.dueAt) ?? 0) : null,
    })),
    settlementQueue: pendingDistributions
      .map((d) => ({
        accountId: d.accountId,
        account: accountById.get(d.accountId)?.name ?? 'Unknown account',
        code: accountById.get(d.accountId)?.code ?? null,
        kind: accountById.get(d.accountId)?.kind ?? null,
        amount: d._sum.amount ?? 0,
        amountLabel: formatNaira(d._sum.amount ?? 0),
        lines: d._count,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}
