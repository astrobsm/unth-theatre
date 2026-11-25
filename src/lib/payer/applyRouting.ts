// ============================================================
// Putting the routing decision onto a case's rows
// ------------------------------------------------------------
// THE ONE SERVICE. Booking creation, booking edit, the pack generator and a
// correction to the payer category all call applyRoutingToSurgery(). None of
// them decides anything itself, because four callers each deciding is how a
// case ends up with its consumables at one counter and its drugs at a counter
// that was told about a different patient.
//
// IT IS IDEMPOTENT. Running it twice changes nothing the second time, so it
// is safe to call after every edit without working out whether anything
// actually moved.
//
// WHAT IT WILL NOT TOUCH, and these are the two that matter:
//
//   A LINE ALREADY DISPENSED. Somebody has picked it and it has left the
//   shelf. Re-routing it would tell a second counter to pick it again.
//
//   A LINE THE NHIA PHARMACY SENT ON. That was a person's decision, made
//   with the scheme's circular in front of them, and recomputing it from the
//   catalogue flags would quietly overrule them — then do it again at the
//   next edit, until they stopped using the button.
// ============================================================

import prisma from '@/lib/prisma';

import { type PayerCategory } from './categories';
import { routeItem, type PackListKind, type RoutableItem } from './routing';

/** Statuses where the item has left the shelf. */
const DISPENSED = ['DELIVERED'];

export interface RoutingRunResult {
  consumables: number;
  pharmacy: number;
  /** Lines left alone because they were dispensed or sent on by hand. */
  skipped: number;
}

/**
 * Recompute where every line of one case should go, and write the changes.
 *
 * `force` ignores the reassignment guard and is for an administrator putting
 * a wrong routing right. It still will not touch a dispensed line, because
 * that one is not a routing question any more.
 */
export async function applyRoutingToSurgery(
  surgeryId: string,
  opts: { force?: boolean } = {},
): Promise<RoutingRunResult> {
  const surgery = await prisma.surgery.findUnique({
    where: { id: surgeryId },
    select: { id: true, payerCategory: true },
  });
  if (!surgery) return { consumables: 0, pharmacy: 0, skipped: 0 };

  const payer = surgery.payerCategory as PayerCategory;
  const now = new Date();
  let skipped = 0;

  /** The coverage flags behind a line, where it came from the catalogue. */
  const factsFor = (
    list: PackListKind,
    row: { templateId: string | null; name: string },
    template: { coveredByNHIA: boolean; coveredByCEmONC: boolean } | undefined,
  ): RoutableItem => ({
    list,
    name: row.name,
    coveredByNHIA: template?.coveredByNHIA ?? null,
    coveredByCEmONC: template?.coveredByCEmONC ?? null,
    // A line with no template behind it was typed by hand. Not the same fact
    // as "not covered": nobody has classified it, which is why it goes on
    // the NHIA Pharmacy's review list rather than silently to the patient.
    fromCatalogue: !!row.templateId,
  });

  // ---- Consumables -------------------------------------------------------
  const consumables = await prisma.surgeryConsumableRequest.findMany({
    where: { surgeryId },
    select: {
      id: true, name: true, status: true, templateId: true,
      routedTo: true, coverageNote: true, reassignedFrom: true,
    },
  });
  const consumableTemplateIds = consumables.map((c) => c.templateId).filter(Boolean) as string[];
  const consumableTemplates = consumableTemplateIds.length
    ? await prisma.surgicalConsumableTemplate.findMany({
      where: { id: { in: consumableTemplateIds } },
      select: { id: true, coveredByNHIA: true, coveredByCEmONC: true },
    })
    : [];
  const consumableById = new Map(consumableTemplates.map((t) => [t.id, t]));

  let consumablesChanged = 0;
  for (const row of consumables) {
    if (DISPENSED.includes(String(row.status).toUpperCase())) { skipped += 1; continue; }
    if (row.reassignedFrom && !opts.force) { skipped += 1; continue; }

    const decision = routeItem(
      payer,
      factsFor('CONSUMABLE', row, consumableById.get(row.templateId ?? '')),
    );
    if (row.routedTo === decision.routedTo && row.coverageNote === decision.coverageNote) continue;

    await prisma.surgeryConsumableRequest.update({
      where: { id: row.id },
      data: {
        routedTo: decision.routedTo,
        routedAt: now,
        coverageNote: decision.coverageNote,
      },
    });
    consumablesChanged += 1;
  }

  // ---- Pharmacy ----------------------------------------------------------
  const drugs = await prisma.surgeryDrugDressingRequest.findMany({
    where: { surgeryId },
    select: {
      id: true, name: true, status: true, templateId: true,
      routedTo: true, coverageNote: true, reassignedFrom: true,
    },
  });
  const drugTemplateIds = drugs.map((d) => d.templateId).filter(Boolean) as string[];
  const drugTemplates = drugTemplateIds.length
    ? await prisma.surgicalDrugDressingTemplate.findMany({
      where: { id: { in: drugTemplateIds } },
      select: { id: true, coveredByNHIA: true, coveredByCEmONC: true },
    })
    : [];
  const drugById = new Map(drugTemplates.map((t) => [t.id, t]));

  let pharmacyChanged = 0;
  for (const row of drugs) {
    if (DISPENSED.includes(String(row.status).toUpperCase())) { skipped += 1; continue; }
    if (row.reassignedFrom && !opts.force) { skipped += 1; continue; }

    const decision = routeItem(
      payer,
      factsFor('PHARMACY', row, drugById.get(row.templateId ?? '')),
    );
    if (row.routedTo === decision.routedTo && row.coverageNote === decision.coverageNote) continue;

    await prisma.surgeryDrugDressingRequest.update({
      where: { id: row.id },
      data: {
        routedTo: decision.routedTo,
        routedAt: now,
        coverageNote: decision.coverageNote,
      },
    });
    pharmacyChanged += 1;
  }

  return { consumables: consumablesChanged, pharmacy: pharmacyChanged, skipped };
}
