import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generatePacks } from '@/lib/packs/generate';
import { resolveBasePack, BASE_PACK_LABEL, toPackMagnitude } from '@/lib/baseConsumablePack';
import { buildPackRequests } from '@/lib/packRequests';

export const dynamic = 'force-dynamic';

/**
 * GET /api/packs/preview?procedure=&magnitude=&subspecialty=
 *
 * WHAT A PROCEDURE WOULD BE PACKED WITH, WITHOUT BOOKING A CASE TO FIND OUT.
 *
 * Asked for directly: "where do I view all the bundle packs for review, to be
 * sure every procedure has the right bundled pack?" The honest answer was
 * nowhere. Two admin screens existed and neither answered it:
 *
 *   - Surgical Packs lists the 77 packs somebody authored by subspecialty. It
 *     is what CAN be applied, not what any given operation gets.
 *   - Procedure Packs lists the procedure-to-pack mapping. Every row in it is
 *     unconfirmed, and buildPackRequests reads only confirmed rows, so that
 *     screen currently describes nothing that happens.
 *
 * For all 628 procedures this hospital has booked, the pack actually comes
 * from the composed standard — base pack, approach, family, Ethicon sutures,
 * guideline prophylaxis — computed per case from the procedure name and the
 * magnitude. Until now the only way to see it was to book a case and look.
 * That is a poor way to review 628 operations, and a worse way to catch the
 * one that packs a cervical spine as a cervix.
 *
 * So this computes exactly what a booking would, from the same helpers in the
 * same order, and returns it without writing anything. It is read-only and
 * touches no case.
 *
 * THE MAGNITUDE IS PART OF THE ANSWER. The same operation at MINOR and at
 * MAJOR are different packs, which is why it is a parameter rather than a
 * default — reviewing one size tells you nothing about the others.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const procedureName = (searchParams.get('procedure') ?? '').trim();
  const subspecialty = (searchParams.get('subspecialty') ?? '').trim() || null;
  const magnitude = (searchParams.get('magnitude') ?? 'MAJOR').trim();
  const ageRaw = searchParams.get('age');
  const patientAge = ageRaw === null || ageRaw === '' ? null : Number(ageRaw);

  if (!procedureName) {
    return NextResponse.json({ error: 'Name a procedure to preview.' }, { status: 400 });
  }

  // What the standard composes. This is what every case gets today.
  const composed = generatePacks({
    procedureName,
    subspecialty,
    magnitude,
    surgeryType: 'ELECTIVE',
    patientAge: Number.isFinite(patientAge) ? patientAge : null,
    patientAgeUnit: 'YEARS',
    // Not inferred here either. A reviewer looking at prophylaxis needs to see
    // the ordinary case; allergy is recorded per patient on the pre-op
    // assessment and changes the options then.
    betaLactamAllergy: false,
  });

  // The mandatory base pack is attached by the booking route separately, so a
  // preview that left it out would show a shorter pack than the case gets.
  const base = resolveBasePack(magnitude).map((b) => ({
    name: b.name,
    quantity: b.quantity,
    unit: b.unit,
    category: b.category,
    size: b.size,
    source: BASE_PACK_LABEL,
  }));

  // An authored mapping, if one has been CONFIRMED, overrides the composed
  // standard at booking. Reported either way so the reviewer knows which of
  // the two they are looking at.
  let mapped: Awaited<ReturnType<typeof buildPackRequests>> = {
    consumables: [], drugs: [], packsUsed: [], unmapped: [],
  };
  try {
    mapped = await buildPackRequests(procedureName, null);
  } catch {
    // A mapping lookup that fails must not stop the preview: the composed
    // pack is the part being reviewed.
  }

  // Whether a row exists at all, confirmed or not, so the screen can say
  // "authored but nobody has agreed it" rather than "nothing here".
  const row = await prisma.procedurePackMap.findFirst({
    where: { procedureName: { equals: procedureName, mode: 'insensitive' } },
    select: { confirmedAt: true, confirmedByName: true, suggestedBasis: true,
              consumablePackName: true, pharmacyPackName: true },
  }).catch(() => null);

  const baseNames = new Set(base.map((b) => b.name.trim().toLowerCase()));

  return NextResponse.json({
    procedureName,
    subspecialty,
    magnitude: toPackMagnitude(magnitude),
    family: composed.family,
    familyLabel: composed.familyLabel,
    approach: composed.approach,
    basis: composed.basis,
    warnings: composed.warnings,
    /** Which of the two a booking would actually use. */
    source: mapped.consumables.length || mapped.drugs.length ? 'mapping' : 'composed',
    mapping: row
      ? {
          exists: true,
          confirmed: !!row.confirmedAt,
          confirmedByName: row.confirmedByName,
          basis: row.suggestedBasis,
          consumablePackName: row.consumablePackName,
          pharmacyPackName: row.pharmacyPackName,
        }
      : { exists: false, confirmed: false },
    base,
    // The composed lines minus anything the base pack already carries, which
    // is how the booking route assembles them too.
    consumables: composed.consumables
      .filter((c) => !baseNames.has(String(c.name).trim().toLowerCase()))
      .map((c) => ({
        name: c.name, quantity: c.quantity, unit: c.unit,
        category: c.category ?? null, size: c.size ?? null,
        source: [c.source, c.note].filter(Boolean).join(' — ') || null,
      })),
    pharmacy: composed.pharmacy.map((d) => ({
      name: d.name, quantity: d.quantity, unit: d.unit,
      type: d.drugType ?? null, dosage: d.dosage ?? null, route: d.route ?? null,
      source: [d.source, d.note].filter(Boolean).join(' — ') || null,
    })),
  });
}
