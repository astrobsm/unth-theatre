/**
 * Give the cases already booked the pack their procedure calls for.
 *
 *     npx tsx scripts/backfill-case-packs.ts           # report only, writes nothing
 *     npx tsx scripts/backfill-case-packs.ts --write   # actually write
 *     npx tsx scripts/backfill-case-packs.ts --all     # include dates already past
 *
 * WHY THESE CASES NEED IT. Until now the booking route attached the mandatory
 * base pack and whatever a confirmed ProcedurePackMap supplied — and the
 * mapping table is populated with SUGGESTIONS whose confirmedAt is NULL, which
 * buildPackRequests deliberately ignores. So a case whose procedure nobody had
 * confirmed was booked with PPE, skin prep and drapes and nothing else: the
 * same list for a cataract and a thoracotomy, and "Pharmacy: nothing
 * requested" on both. Booking now composes the standard where no mapping
 * applies; this does the same for the cases booked before it did.
 *
 * IT IS THE SAME THREE HELPERS the routes use — resolveBasePack,
 * buildPackRequests, fallbackPacks — in the same order. A second way of
 * deciding what a procedure needs is how the store and the surgeon end up
 * disagreeing about what was asked for.
 *
 * ADDITIVE, IDEMPOTENT, AND IT NEVER TAKES ANYTHING AWAY.
 *   - A line already on the case is left alone, matched by name within each
 *     list, so running it twice changes nothing the second time.
 *   - A quantity somebody set deliberately is never overwritten.
 *   - A WITHDRAWN line stays withdrawn. It was cancelled on purpose, and
 *     quietly resurrecting it would be the worst outcome here — so withdrawn
 *     names count as present.
 *
 * SCOPE. By default only cases that are still ahead of us and not completed or
 * cancelled: packing a finished operation is noise, and noise on this list is
 * how a real gap gets missed.
 */
import prisma from '../src/lib/prisma';
import { resolveBasePack, BASE_PACK_LABEL } from '../src/lib/baseConsumablePack';
import { buildPackRequests } from '../src/lib/packRequests';
import { fallbackPacks } from '../src/lib/packs/fallback';
import { toConsumableCategory, toDrugType } from '../src/lib/packs/enums';

const WRITE = process.argv.includes('--write');
const ALL = process.argv.includes('--all');

const key = (s: unknown) => String(s ?? '').trim().toLowerCase();

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cases = await prisma.surgery.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      ...(ALL ? {} : { scheduledDate: { gte: today } }),
    },
    select: {
      id: true,
      procedureName: true,
      additionalProcedures: true,
      magnitude: true,
      subspecialty: true,
      surgeryType: true,
      scheduledDate: true,
      patient: { select: { age: true, ageUnit: true } },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  console.log(`${cases.length} case(s) in scope${ALL ? ' (all dates)' : ' (today onwards)'}.`);
  console.log(WRITE ? 'WRITING.\n' : 'Dry run — nothing will be written. Add --write.\n');

  let touched = 0;
  let addedC = 0;
  let addedD = 0;
  let alreadyFine = 0;
  let composedFor = 0;

  for (const c of cases) {
    if (!c.procedureName?.trim()) continue;

    const [existingC, existingD] = await Promise.all([
      prisma.surgeryConsumableRequest.findMany({
        where: { surgeryId: c.id }, select: { name: true },
      }),
      prisma.surgeryDrugDressingRequest.findMany({
        where: { surgeryId: c.id }, select: { name: true },
      }),
    ]);
    // Every existing line counts as present, WITHDRAWN ones included.
    const haveC = new Set(existingC.map((r) => key(r.name)));
    const haveD = new Set(existingD.map((r) => key(r.name)));

    let mapped: Awaited<ReturnType<typeof buildPackRequests>> = {
      consumables: [], drugs: [], packsUsed: [], unmapped: [],
    };
    try {
      mapped = await buildPackRequests(
        c.procedureName,
        Array.isArray(c.additionalProcedures)
          ? (c.additionalProcedures as string[]).join('\n')
          : (c.additionalProcedures as string | null) ?? null,
      );
    } catch (err) {
      console.error(`  ! ${c.id}: mapping failed`, err);
    }

    // The floor is what the case ALREADY HAS, not zero — otherwise this would
    // compose a second pharmacy list for a case a pharmacist had authored.
    const composed = fallbackPacks({
      procedureName: c.procedureName,
      subspecialty: c.subspecialty,
      magnitude: c.magnitude,
      surgeryType: c.surgeryType,
      additionalProcedures: Array.isArray(c.additionalProcedures)
        ? (c.additionalProcedures as string[]).join('\n')
        : (c.additionalProcedures as string | null) ?? null,
      patientAge: c.patient?.age ?? null,
      patientAgeUnit: c.patient?.ageUnit ?? null,
      // Allergy lives on the pre-operative assessment. The generator warns
      // that the choice must be confirmed rather than guessing it here.
      betaLactamAllergy: false,
      haveConsumables: existingC.length + mapped.consumables.length,
      haveDrugs: existingD.length + mapped.drugs.length,
    });
    if (composed.generated) composedFor += 1;

    const basePack = resolveBasePack(c.magnitude).map((b) => ({
      name: b.name,
      category: b.category,
      size: b.size,
      unit: b.unit,
      quantity: b.quantity,
      notes: BASE_PACK_LABEL,
    }));

    const seenC = new Set<string>();
    const newConsumables = [...basePack, ...mapped.consumables, ...composed.consumables]
      .filter((x: any) => x?.name)
      .filter((x: any) => !haveC.has(key(x.name)))
      .filter((x: any) => (seenC.has(key(x.name)) ? false : (seenC.add(key(x.name)), true)));

    const seenD = new Set<string>();
    const newDrugs = [...mapped.drugs, ...composed.drugs]
      .filter((x: any) => x?.name)
      .filter((x: any) => !haveD.has(key(x.name)))
      .filter((x: any) => (seenD.has(key(x.name)) ? false : (seenD.add(key(x.name)), true)));

    if (newConsumables.length === 0 && newDrugs.length === 0) {
      alreadyFine += 1;
      continue;
    }

    touched += 1;
    addedC += newConsumables.length;
    addedD += newDrugs.length;

    const when = c.scheduledDate ? c.scheduledDate.toISOString().slice(0, 10) : '—';
    console.log(
      `  ${when}  ${c.procedureName}  (${c.magnitude ?? 'no magnitude'})`
      + `  +${newConsumables.length} consumable, +${newDrugs.length} pharmacy`
      + (composed.generated ? '  [composed]' : '  [mapped]'),
    );

    if (!WRITE) continue;

    if (newConsumables.length) {
      await prisma.surgeryConsumableRequest.createMany({
        data: newConsumables.map((x: any) => ({
          surgeryId: c.id,
          templateId: x.templateId ?? null,
          name: String(x.name),
          category: toConsumableCategory(x.category) as never,
          size: x.size ?? null,
          unit: x.unit ?? 'piece',
          quantity: Number(x.quantity) > 0 ? Math.round(Number(x.quantity)) : 1,
          notes: x.notes ?? null,
          // No session here. The columns are nullable and a wrong name would
          // be worse than none: nobody "requested" these, a backfill did.
          requestedById: null,
          requestedByName: 'Backfill (procedure + complexity)',
        })),
      });
    }
    if (newDrugs.length) {
      await prisma.surgeryDrugDressingRequest.createMany({
        data: newDrugs.map((x: any) => ({
          surgeryId: c.id,
          templateId: x.templateId ?? null,
          name: String(x.name),
          type: toDrugType(x.type ?? x.drugType ?? x.category) as never,
          dosage: x.dosage ?? null,
          route: x.route ?? null,
          unit: x.unit ?? 'vial',
          quantity: Number(x.quantity) > 0 ? Math.round(Number(x.quantity)) : 1,
          notes: x.notes ?? null,
        })),
      });
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`cases in scope:        ${cases.length}`);
  console.log(`already complete:      ${alreadyFine}`);
  console.log(`cases ${WRITE ? 'updated' : 'that would change'}: ${touched}`);
  console.log(`  consumable lines:    ${addedC}`);
  console.log(`  pharmacy lines:      ${addedD}`);
  console.log(`composed (no confirmed mapping): ${composedFor}`);
  if (!WRITE) console.log('\nNothing was written. Re-run with --write.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
