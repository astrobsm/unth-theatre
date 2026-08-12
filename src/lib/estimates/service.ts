// ============================================================
// The estimate service — the only place an estimate is written
// ------------------------------------------------------------
// Every route goes through here, so the rules cannot be bypassed by adding
// another endpoint later. In particular: a client may propose lines, but the
// amounts and totals are always resolved and recomputed HERE, from the price
// master, before anything is stored.
// ============================================================

import prisma from '@/lib/prisma';
import { recalculate, type DraftLine, type EstimateTotals } from './calculate';
import { buildFromPacks, lineForCharge } from './fromPacks';
import { admissionCode, type TariffRow } from './priceLookup';

/** Statuses whose figures are settled. Editing one revises rather than mutates. */
export const LOCKED_STATUSES = ['ISSUED', 'SUPERSEDED', 'CANCELLED', 'APPROVED'] as const;

export function isLocked(status: string): boolean {
  return (LOCKED_STATUSES as readonly string[]).includes(status);
}

/**
 * Next estimate number, e.g. EST-2026-000124.
 *
 * Derived by counting the year's rows inside the caller's transaction. Two
 * simultaneous bookings could otherwise pick the same number, and the unique
 * index would reject the second — so this must run in the same transaction as
 * the insert, and the caller retries on collision.
 */
export async function nextEstimateNumber(
  tx: { surgeryEstimate: { count: (a: unknown) => Promise<number> } },
  year: number
): Promise<string> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const n = await tx.surgeryEstimate.count({
    where: { createdAt: { gte: from, lt: to } },
  });
  return `EST-${year}-${String(n + 1).padStart(6, '0')}`;
}

/** Tariffs relevant to an estimate. Loaded once; selection is pure. */
export async function loadTariffs(): Promise<TariffRow[]> {
  const rows = await prisma.tariff.findMany({
    select: {
      id: true, code: true, name: true, kind: true, amount: true,
      effectiveFrom: true, effectiveTo: true, itemId: true, surgicalPackId: true,
    },
  });
  return rows as unknown as TariffRow[];
}

export interface AutoBuildInput {
  subspecialty?: string | null;
  /** Charge codes for the fee/theatre lines, from configuration not hardcoded. */
  procedureCode?: string | null;
  anaesthesiaCode?: string | null;
  theatreCode?: string | null;
  admissionBaseCode?: string | null;
  ward?: string | null;
  expectedStayDays?: number;
  admissionType?: 'DAY_CASE' | 'INPATIENT';
  /** The date whose prices apply. The planned operation date, not today. */
  on: Date;
}

/**
 * Assemble a proposed line set for a procedure.
 *
 * Everything comes from the price master and the pack library. Nothing here
 * invents an amount, and no procedure or fee is written into the code — an
 * absent code simply produces no line and an entry in `unpriced`.
 */
export async function autoBuildLines(input: AutoBuildInput): Promise<{
  lines: DraftLine[];
  unpriced: { description: string; kind: string; code?: string; reason: string }[];
}> {
  const tariffs = await loadTariffs();
  const lines: DraftLine[] = [];
  const unpriced: { description: string; kind: string; code?: string; reason: string }[] = [];

  const add = (
    l: DraftLine | null,
    label: string,
    kind: string,
    code?: string | null
  ) => {
    if (l) lines.push(l);
    else if (code) {
      unpriced.push({ description: label, kind, code, reason: 'no price in force for this code' });
    }
  };

  if (input.procedureCode) {
    add(lineForCharge(tariffs, {
      section: 'SURGICAL_FEE', kind: 'PROCEDURE',
      code: input.procedureCode, description: "Surgeon's professional fee",
    }, input.on), "Surgeon's professional fee", 'PROCEDURE', input.procedureCode);
  }

  if (input.anaesthesiaCode) {
    add(lineForCharge(tariffs, {
      section: 'ANAESTHESIA_FEE', kind: 'ANAESTHESIA',
      code: input.anaesthesiaCode, description: "Anaesthetist's professional fee",
    }, input.on), "Anaesthetist's professional fee", 'ANAESTHESIA', input.anaesthesiaCode);
  }

  if (input.theatreCode) {
    add(lineForCharge(tariffs, {
      section: 'THEATRE', kind: 'THEATRE',
      code: input.theatreCode, description: 'Theatre charge',
    }, input.on), 'Theatre charge', 'THEATRE', input.theatreCode);
  }

  // Admission: priced per ward, with the ward folded into the code exactly as
  // the bulk import does. Quantity is left unset on purpose — recalculate()
  // expands it by expectedStayDays, so the header and the line cannot disagree.
  if (input.admissionBaseCode && input.admissionType === 'INPATIENT') {
    const code = admissionCode(input.admissionBaseCode, input.ward);
    add(lineForCharge(tariffs, {
      section: 'ADMISSION', kind: 'ADMISSION', code,
      description: input.ward ? `Bed charge — ${input.ward}` : 'Bed charge',
      unit: 'day',
    }, input.on), 'Bed charge', 'ADMISSION', code);
  }

  // Packs for the subspecialty: the surgical set plus the anaesthetic set,
  // which is stored under an ANAESTHESIA:: prefixed subspecialty.
  if (input.subspecialty) {
    const packs = await prisma.surgicalPack.findMany({
      where: {
        isActive: true,
        subspecialty: { in: [input.subspecialty, `ANAESTHESIA::${input.subspecialty}`] },
      },
      select: {
        id: true, name: true, kind: true, subspecialty: true,
        items: {
          select: {
            id: true, name: true, quantity: true, unit: true,
            category: true, drugType: true, dosage: true, sortOrder: true,
          },
        },
      },
    });

    const built = buildFromPacks(packs as never, tariffs, input.on);
    lines.push(...built.lines);
    unpriced.push(...built.unpriced);
  }

  return { lines, unpriced };
}

/**
 * Replace an estimate's lines and store the recomputed figures.
 *
 * The totals written are the ones this function computes — a caller-supplied
 * total is ignored, never trusted. Lines and header move together in one
 * transaction so a total can never describe a different set of lines than the
 * ones stored beside it.
 */
export async function replaceLines(
  estimateId: string,
  lines: DraftLine[],
  opts: {
    expectedStayDays?: number;
    admissionType?: 'DAY_CASE' | 'INPATIENT';
    depositPercent?: number;
    depositKobo?: number;
  } = {}
): Promise<EstimateTotals> {
  const totals = recalculate({
    lines,
    expectedStayDays: opts.expectedStayDays,
    admissionType: opts.admissionType,
    depositPercent: opts.depositPercent,
    depositKobo: opts.depositKobo,
  });

  await prisma.$transaction(async (tx) => {
    await tx.surgeryEstimateLine.deleteMany({ where: { estimateId } });

    if (totals.lines.length) {
      await tx.surgeryEstimateLine.createMany({
        data: totals.lines.map((l) => ({
          estimateId,
          section: l.section as never,
          kind: l.kind as never,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          unitPriceKobo: l.unitPriceKobo,
          totalKobo: l.totalKobo,
          tariffId: l.tariffId ?? null,
          inventoryItemId: l.inventoryItemId ?? null,
          surgicalPackId: l.surgicalPackId ?? null,
          investigationId: l.investigationId ?? null,
          medicationName: l.medicationName ?? null,
          priceEffectiveFrom: l.priceEffectiveFrom ?? null,
          frequencyPerDay: l.frequencyPerDay ?? null,
          durationDays: l.durationDays ?? null,
          priceOverridden: l.priceOverridden ?? false,
          originalUnitPriceKobo: l.originalUnitPriceKobo ?? null,
          overrideReason: l.overrideReason ?? null,
          sortOrder: l.sortOrder,
        })),
      });
    }

    await tx.surgeryEstimate.update({
      where: { id: estimateId },
      data: {
        subtotalKobo: totals.subtotalKobo,
        depositKobo: totals.depositKobo,
        totalKobo: totals.totalKobo,
      },
    });
  });

  return totals;
}
