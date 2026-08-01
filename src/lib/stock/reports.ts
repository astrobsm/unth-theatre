// ============================================================
// Theatre supply chain and billing reports
// ------------------------------------------------------------
// Built the same way the imprest reports are, and for the same reason: every
// figure is derived from the stored rows at request time rather than kept in a
// summary table, so a report can never disagree with the ledger it claims to
// summarise.
//
// The builders live here rather than in the route so the Excel export produces
// the same numbers as the screen, without a serverless function fetching
// itself. That pattern is already proven in lib/imprest/reports.
// ============================================================

import prisma from '@/lib/prisma';
import { available, onHand, unreconciled } from './quantities';
import { daysUntilExpiry, isExpired } from './rules';

/** A refusal a builder can raise, carrying the status the route returns. */
export class StockReportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'StockReportError';
  }
}

export const STOCK_REPORT_KINDS = [
  'consumption',
  'drug-usage',
  'controlled-register',
  'inventory-valuation',
  'expiry',
  'stock-outs',
  'emergency-usage',
  'vendor-settlement',
  'procedure-cost',
  'revenue-distribution',
  'outstanding-invoices',
] as const;
export type StockReportKind = (typeof STOCK_REPORT_KINDS)[number];

function dateWindow(sp: URLSearchParams) {
  const from = sp.get('from');
  const to = sp.get('to');
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Daily theatre consumption — what was used, and on whom
// ---------------------------------------------------------------------------
async function consumption(sp: URLSearchParams) {
  const occurredAt = dateWindow(sp);
  const rows = await prisma.stockMovement.findMany({
    where: { type: 'CONSUME', ...(occurredAt ? { occurredAt } : {}) },
    include: {
      batch: { select: { batchNumber: true, sellingPrice: true, owner: true, item: { select: { name: true, category: true } } } },
      surgery: { select: { id: true, surgeryType: true, patient: { select: { name: true } } } },
    },
    orderBy: { occurredAt: 'desc' },
    take: 2000,
  });

  const lines = rows.map((m) => ({
    id: m.id,
    occurredAt: m.occurredAt,
    item: m.batch.item.name,
    category: m.batch.item.category,
    batchNumber: m.batch.batchNumber,
    quantity: m.quantity,
    unitPrice: m.batch.sellingPrice,
    value: m.batch.sellingPrice * m.quantity,
    owner: m.batch.owner,
    surgeryType: m.surgery?.surgeryType ?? null,
    patient: m.surgery?.patient?.name ?? null,
    actor: m.actorName,
  }));

  return {
    kind: 'consumption',
    generatedAt: new Date(),
    lines,
    totals: {
      movements: lines.length,
      units: lines.reduce((s, l) => s + l.quantity, 0),
      value: lines.reduce((s, l) => s + l.value, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Drug usage, and the controlled drug register
// ---------------------------------------------------------------------------
async function drugUsage(sp: URLSearchParams, controlledOnly: boolean) {
  const occurredAt = dateWindow(sp);
  const rows = await prisma.stockMovement.findMany({
    where: {
      type: { in: controlledOnly ? ['ISSUE', 'RETURN', 'CONSUME'] : ['CONSUME'] },
      ...(occurredAt ? { occurredAt } : {}),
      batch: {
        ...(controlledOnly ? { location: { isControlled: true } } : {}),
        item: { category: controlledOnly ? undefined : 'CONSUMABLE' },
      },
    },
    include: {
      batch: {
        select: {
          batchNumber: true,
          sellingPrice: true,
          item: { select: { name: true } },
          location: { select: { name: true, isControlled: true } },
        },
      },
      surgery: { select: { id: true, patient: { select: { name: true } } } },
    },
    orderBy: { occurredAt: 'desc' },
    take: 2000,
  });

  const lines = rows.map((m) => ({
    id: m.id,
    occurredAt: m.occurredAt,
    drug: m.batch.item.name,
    batchNumber: m.batch.batchNumber,
    movement: m.type,
    quantity: m.quantity,
    store: m.batch.location?.name ?? null,
    patient: m.surgery?.patient?.name ?? null,
    actor: m.actorName,
    // The pair that makes a controlled register a register rather than a list.
    witness: m.witnessName,
    reason: m.reason,
  }));

  return {
    kind: controlledOnly ? 'controlled-register' : 'drug-usage',
    generatedAt: new Date(),
    lines,
    totals: {
      movements: lines.length,
      units: lines.reduce((s, l) => s + l.quantity, 0),
      // An issue or discard from a controlled store with no witness recorded is
      // the exact thing an inspection looks for.
      unwitnessed: controlledOnly ? lines.filter((l) => !l.witness && l.movement !== 'RETURN').length : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Inventory valuation, expiry, stock-outs
// ---------------------------------------------------------------------------
async function inventoryValuation() {
  const batches = await prisma.stockBatch.findMany({
    where: { deletedAt: null },
    include: { item: { select: { name: true, category: true } }, location: { select: { name: true } }, vendor: { select: { name: true } } },
  });

  const lines = batches
    .map((b) => ({
      id: b.id,
      item: b.item.name,
      category: b.item.category,
      batchNumber: b.batchNumber,
      location: b.location?.name ?? null,
      owner: b.owner,
      vendor: b.vendor?.name ?? null,
      onHand: onHand(b),
      available: available(b),
      // Valued at purchase price: what the hospital paid, which is the figure a
      // balance sheet wants — not what it hopes to sell it for.
      unitCost: b.purchasePrice,
      value: b.purchasePrice * onHand(b),
      expiryDate: b.expiryDate,
      expired: isExpired(b.expiryDate),
    }))
    .filter((l) => l.onHand !== 0)
    .sort((a, b) => b.value - a.value);

  return {
    kind: 'inventory-valuation',
    generatedAt: new Date(),
    lines,
    totals: {
      batches: lines.length,
      units: lines.reduce((s, l) => s + l.onHand, 0),
      value: lines.reduce((s, l) => s + l.value, 0),
      // Stock the hospital owns versus stock it merely holds.
      hospitalValue: lines.filter((l) => l.owner !== 'VENDOR').reduce((s, l) => s + l.value, 0),
      consignmentValue: lines.filter((l) => l.owner === 'VENDOR').reduce((s, l) => s + l.value, 0),
      expiredValue: lines.filter((l) => l.expired).reduce((s, l) => s + l.value, 0),
    },
  };
}

async function expiryReport(sp: URLSearchParams) {
  const days = Number(sp.get('withinDays') ?? 90);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const batches = await prisma.stockBatch.findMany({
    where: { deletedAt: null, expiryDate: { not: null, lte: cutoff } },
    include: { item: { select: { name: true } }, location: { select: { name: true } } },
    orderBy: { expiryDate: 'asc' },
  });

  const lines = batches
    .map((b) => ({
      id: b.id,
      item: b.item.name,
      batchNumber: b.batchNumber,
      location: b.location?.name ?? null,
      onHand: onHand(b),
      expiryDate: b.expiryDate,
      daysUntilExpiry: daysUntilExpiry(b.expiryDate),
      expired: isExpired(b.expiryDate),
      valueAtRisk: b.purchasePrice * onHand(b),
    }))
    .filter((l) => l.onHand > 0);

  return {
    kind: 'expiry',
    generatedAt: new Date(),
    withinDays: days,
    lines,
    totals: {
      batches: lines.length,
      alreadyExpired: lines.filter((l) => l.expired).length,
      // The number that should drive action: money about to be thrown away.
      valueAtRisk: lines.reduce((s, l) => s + l.valueAtRisk, 0),
      expiredValue: lines.filter((l) => l.expired).reduce((s, l) => s + l.valueAtRisk, 0),
    },
  };
}

async function stockOuts() {
  const items = await prisma.inventoryItem.findMany({
    include: { stockBatches: { where: { deletedAt: null } } },
  });

  const lines = items
    .map((i) => {
      const usable = i.stockBatches.filter((b) => !isExpired(b.expiryDate) && b.status !== 'DISPOSED');
      const free = usable.reduce((s, b) => s + available(b), 0);
      return {
        itemId: i.id,
        item: i.name,
        category: i.category,
        available: free,
        reorderLevel: i.reorderLevel,
        batches: usable.length,
        outOfStock: free === 0,
        belowReorder: free <= i.reorderLevel,
      };
    })
    .filter((l) => l.belowReorder)
    .sort((a, b) => a.available - b.available);

  return {
    kind: 'stock-outs',
    generatedAt: new Date(),
    lines,
    totals: {
      items: lines.length,
      outOfStock: lines.filter((l) => l.outOfStock).length,
    },
  };
}

async function emergencyUsage(sp: URLSearchParams) {
  const occurredAt = dateWindow(sp);
  const rows = await prisma.stockMovement.findMany({
    where: {
      ...(occurredAt ? { occurredAt } : {}),
      batch: { location: { isEmergency: true } },
      type: { in: ['ISSUE', 'CONSUME'] },
    },
    include: {
      batch: { select: { batchNumber: true, item: { select: { name: true } } } },
      surgery: { select: { surgeryType: true, patient: { select: { name: true } } } },
    },
    orderBy: { occurredAt: 'desc' },
    take: 1000,
  });

  const lines = rows.map((m) => ({
    id: m.id,
    occurredAt: m.occurredAt,
    item: m.batch.item.name,
    batchNumber: m.batch.batchNumber,
    movement: m.type,
    quantity: m.quantity,
    surgeryType: m.surgery?.surgeryType ?? null,
    patient: m.surgery?.patient?.name ?? null,
    actor: m.actorName,
    // An elective case drawing on emergency stock should always name who let it.
    authorisation: m.reason,
  }));

  return {
    kind: 'emergency-usage',
    generatedAt: new Date(),
    lines,
    totals: {
      movements: lines.length,
      units: lines.reduce((s, l) => s + l.quantity, 0),
      electiveDraws: lines.filter((l) => l.surgeryType === 'ELECTIVE').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
async function vendorSettlement(sp: URLSearchParams) {
  const occurredAt = dateWindow(sp);

  // Ownership transfers ARE the settlement events: each one is the moment a
  // vendor's stock became the hospital's, and therefore became payable.
  const transfers = await prisma.stockMovement.findMany({
    where: { type: 'OWNERSHIP_TRANSFER', ...(occurredAt ? { occurredAt } : {}) },
    include: {
      batch: {
        select: {
          batchNumber: true,
          vendorPrice: true,
          sellingPrice: true,
          item: { select: { name: true } },
          vendor: { select: { id: true, name: true, bankName: true, accountNumber: true } },
        },
      },
      surgery: { select: { id: true } },
    },
    orderBy: { occurredAt: 'desc' },
  });

  const byVendor = new Map<string, {
    vendorId: string; vendor: string; bankName: string | null; accountNumber: string | null;
    units: number; owed: number; billed: number; lines: number;
  }>();

  for (const t of transfers) {
    const v = t.batch.vendor;
    if (!v) continue;
    const row = byVendor.get(v.id) ?? {
      vendorId: v.id, vendor: v.name, bankName: v.bankName, accountNumber: v.accountNumber,
      units: 0, owed: 0, billed: 0, lines: 0,
    };
    row.units += t.quantity;
    // Owed at the vendor's price; billed at what the patient paid. The gap is
    // the hospital's margin, and a settlement statement that hides it invites
    // an argument.
    row.owed += t.batch.vendorPrice * t.quantity;
    row.billed += t.batch.sellingPrice * t.quantity;
    row.lines += 1;
    byVendor.set(v.id, row);
  }

  const lines = Array.from(byVendor.values())
    .map((v) => ({ ...v, margin: v.billed - v.owed }))
    .sort((a, b) => b.owed - a.owed);

  return {
    kind: 'vendor-settlement',
    generatedAt: new Date(),
    lines,
    detail: transfers.map((t) => ({
      id: t.id,
      occurredAt: t.occurredAt,
      vendor: t.batch.vendor?.name ?? null,
      item: t.batch.item.name,
      batchNumber: t.batch.batchNumber,
      quantity: t.quantity,
      owed: t.batch.vendorPrice * t.quantity,
    })),
    totals: {
      vendors: lines.length,
      owed: lines.reduce((s, l) => s + l.owed, 0),
      billed: lines.reduce((s, l) => s + l.billed, 0),
      margin: lines.reduce((s, l) => s + l.margin, 0),
    },
  };
}

async function procedureCost(sp: URLSearchParams) {
  const createdAt = dateWindow(sp);
  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: null, ...(createdAt ? { createdAt } : {}) },
    include: {
      lines: { select: { kind: true, lineTotal: true } },
      surgery: { select: { id: true, surgeryType: true, procedureName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const lines = invoices.map((i) => {
    const byKind = (kind: string) => i.lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.lineTotal, 0);
    return {
      invoiceNumber: i.invoiceNumber,
      procedure: i.surgery?.procedureName ?? null,
      surgeryType: i.surgery?.surgeryType ?? null,
      status: i.status,
      theatre: byKind('THEATRE') + byKind('PROCEDURE'),
      anaesthesia: byKind('ANAESTHESIA'),
      consumables: byKind('CONSUMABLE'),
      drugs: byKind('DRUG'),
      implants: byKind('IMPLANT'),
      cssd: byKind('CSSD'),
      total: i.total,
      paid: i.amountPaid,
    };
  });

  // Averages per procedure name — the figure that answers "what does this
  // operation actually cost us to do".
  const byProcedure = new Map<string, { procedure: string; cases: number; total: number }>();
  for (const l of lines) {
    const key = l.procedure ?? 'Unspecified';
    const row = byProcedure.get(key) ?? { procedure: key, cases: 0, total: 0 };
    row.cases += 1;
    row.total += l.total;
    byProcedure.set(key, row);
  }

  return {
    kind: 'procedure-cost',
    generatedAt: new Date(),
    lines,
    byProcedure: Array.from(byProcedure.values())
      .map((p) => ({ ...p, average: p.cases > 0 ? Math.round(p.total / p.cases) : 0 }))
      .sort((a, b) => b.total - a.total),
    totals: {
      invoices: lines.length,
      billed: lines.reduce((s, l) => s + l.total, 0),
      collected: lines.reduce((s, l) => s + l.paid, 0),
    },
  };
}

async function revenueDistributionReport(sp: URLSearchParams) {
  const createdAt = dateWindow(sp);
  const rows = await prisma.revenueDistribution.findMany({
    where: { ...(createdAt ? { createdAt } : {}), status: { not: 'CANCELLED' } },
    include: {
      account: { select: { code: true, name: true, kind: true } },
      invoice: { select: { invoiceNumber: true, total: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });

  const byAccount = new Map<string, { account: string; code: string; kind: string; amount: number; invoices: number; pending: number }>();
  for (const d of rows) {
    const row = byAccount.get(d.accountId) ?? {
      account: d.account.name, code: d.account.code, kind: d.account.kind, amount: 0, invoices: 0, pending: 0,
    };
    row.amount += d.amount;
    row.invoices += 1;
    if (d.status === 'PENDING') row.pending += d.amount;
    byAccount.set(d.accountId, row);
  }

  const lines = Array.from(byAccount.values()).sort((a, b) => b.amount - a.amount);

  return {
    kind: 'revenue-distribution',
    generatedAt: new Date(),
    lines,
    totals: {
      accounts: lines.length,
      distributed: lines.reduce((s, l) => s + l.amount, 0),
      awaitingSettlement: lines.reduce((s, l) => s + l.pending, 0),
    },
  };
}

async function outstandingInvoices() {
  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    orderBy: { issuedAt: 'asc' },
  });

  const now = Date.now();
  const lines = invoices.map((i) => ({
    invoiceNumber: i.invoiceNumber,
    patient: i.patientName,
    status: i.status,
    total: i.total,
    paid: i.amountPaid,
    balance: Math.max(0, i.total - i.amountPaid),
    issuedAt: i.issuedAt,
    dueAt: i.dueAt,
    daysOutstanding: i.issuedAt ? Math.floor((now - i.issuedAt.getTime()) / 86_400_000) : 0,
    overdue: Boolean(i.dueAt && i.dueAt.getTime() < now),
  }));

  return {
    kind: 'outstanding-invoices',
    generatedAt: new Date(),
    lines,
    totals: {
      invoices: lines.length,
      outstanding: lines.reduce((s, l) => s + l.balance, 0),
      overdue: lines.filter((l) => l.overdue).length,
      overdueValue: lines.filter((l) => l.overdue).reduce((s, l) => s + l.balance, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Reconciliation — batches whose counters do not add up
// ---------------------------------------------------------------------------
/**
 * Stock that left the store and was never accounted for. Not one of the
 * requested reports, but it is the one an auditor asks for first, and the
 * counters already carry the answer.
 */
export async function reconciliationExceptions() {
  const batches = await prisma.stockBatch.findMany({
    where: { deletedAt: null },
    include: { item: { select: { name: true } }, location: { select: { name: true, isControlled: true } } },
  });

  const lines = batches
    .map((b) => ({
      id: b.id,
      item: b.item.name,
      batchNumber: b.batchNumber,
      location: b.location?.name ?? null,
      controlled: Boolean(b.location?.isControlled),
      issued: b.quantityIssued,
      returned: b.quantityReturned,
      used: b.quantityUsed,
      wasted: b.quantityDamaged,
      unaccounted: unreconciled(b),
    }))
    .filter((l) => l.unaccounted !== 0)
    .sort((a, b) => Math.abs(b.unaccounted) - Math.abs(a.unaccounted));

  return {
    kind: 'reconciliation',
    generatedAt: new Date(),
    lines,
    totals: {
      batches: lines.length,
      unaccounted: lines.reduce((s, l) => s + l.unaccounted, 0),
      controlledBatches: lines.filter((l) => l.controlled).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
export async function buildStockReport(kind: string, sp: URLSearchParams): Promise<Record<string, unknown>> {
  switch (kind) {
    case 'consumption': return (await consumption(sp)) as never;
    case 'drug-usage': return (await drugUsage(sp, false)) as never;
    case 'controlled-register': return (await drugUsage(sp, true)) as never;
    case 'inventory-valuation': return (await inventoryValuation()) as never;
    case 'expiry': return (await expiryReport(sp)) as never;
    case 'stock-outs': return (await stockOuts()) as never;
    case 'emergency-usage': return (await emergencyUsage(sp)) as never;
    case 'vendor-settlement': return (await vendorSettlement(sp)) as never;
    case 'procedure-cost': return (await procedureCost(sp)) as never;
    case 'revenue-distribution': return (await revenueDistributionReport(sp)) as never;
    case 'outstanding-invoices': return (await outstandingInvoices()) as never;
    case 'reconciliation': return (await reconciliationExceptions()) as never;
    default:
      throw new StockReportError(400, `Unknown report "${kind}".`);
  }
}
