import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildPackRequests } from '@/lib/packRequests';
import { resolveBasePack, BASE_PACK_LABEL } from '@/lib/baseConsumablePack';
import { canEditPack } from '@/lib/theatreOps/packAmendment';

export const dynamic = 'force-dynamic';

/**
 * POST /api/surgeries/[id]/pack/generate
 *
 * Build the standard consumable and pharmacy packs for a case from the
 * procedure it was booked for.
 *
 * WHY THIS EXISTS SEPARATELY
 *
 * Booking already does this — but only at booking. A case booked before its
 * procedure was mapped, or booked in a hurry, or amended afterwards, ends up
 * with empty lists and no way back except adding items one at a time. The
 * mapping that was right at booking is still right now, so it should be one
 * button rather than twenty lines of typing at seven in the morning.
 *
 * It uses the SAME helpers the booking route uses — resolveBasePack and
 * buildPackRequests — rather than a second implementation. Two ways of deciding
 * what a procedure needs is how the store and the surgeon end up disagreeing
 * about what was asked for.
 *
 * ADDITIVE AND IDEMPOTENT. It never removes, never overwrites a quantity
 * somebody set deliberately, and never re-adds a line already present — by name
 * within each list, so pressing it twice is harmless and pressing it after
 * somebody has edited the list does not undo their work. A line that was
 * WITHDRAWN stays withdrawn: it was cancelled on purpose, and quietly
 * resurrecting it would be the worst outcome of all.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? null;
  const userId = (session.user as { id?: string }).id ?? null;
  const userName =
    (session.user as { fullName?: string }).fullName || session.user.name || 'Unknown';

  if (!canEditPack(role)) {
    return NextResponse.json(
      { error: 'Only the surgical team may change what a case is packed with.' },
      { status: 403 },
    );
  }

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        procedureName: true,
        additionalProcedures: true,
        magnitude: true,
        status: true,
      },
    });
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    if (['COMPLETED', 'CANCELLED'].includes(surgery.status)) {
      return NextResponse.json(
        { error: 'This case is closed. Its packs can no longer be changed.' },
        { status: 400 },
      );
    }

    // What the procedure maps to. Never fatal: an unmapped procedure should
    // still get the mandatory base pack rather than nothing at all.
    let mapped: Awaited<ReturnType<typeof buildPackRequests>> = {
      consumables: [], drugs: [], packsUsed: [], unmapped: [],
    };
    try {
      mapped = await buildPackRequests(
        surgery.procedureName,
        Array.isArray(surgery.additionalProcedures)
          ? surgery.additionalProcedures.join('\n')
          : (surgery.additionalProcedures as string | null) ?? null,
      );
    } catch (e) {
      console.error('[pack/generate] mapping unavailable:', e);
    }

    const basePack = resolveBasePack(surgery.magnitude).map((b) => ({
      name: b.name,
      category: b.category as never,
      size: b.size,
      unit: b.unit,
      quantity: b.quantity,
      notes: BASE_PACK_LABEL,
    }));

    // Everything already on the case, including withdrawn lines — see the note
    // above about not resurrecting a cancellation.
    const [existingC, existingD] = await Promise.all([
      prisma.surgeryConsumableRequest.findMany({
        where: { surgeryId: params.id }, select: { name: true },
      }),
      prisma.surgeryDrugDressingRequest.findMany({
        where: { surgeryId: params.id }, select: { name: true },
      }),
    ]);
    const haveC = new Set(existingC.map((r) => r.name.trim().toLowerCase()));
    const haveD = new Set(existingD.map((r) => r.name.trim().toLowerCase()));

    const newConsumables = [...basePack, ...mapped.consumables]
      .filter((c: any) => c?.name && !haveC.has(String(c.name).trim().toLowerCase()))
      // The mapping and the base pack can name the same item; keep the first.
      .filter((c: any, i, arr) =>
        arr.findIndex((x: any) => String(x.name).trim().toLowerCase() === String(c.name).trim().toLowerCase()) === i);

    const newDrugs = mapped.drugs
      .filter((d: any) => d?.name && !haveD.has(String(d.name).trim().toLowerCase()))
      .filter((d: any, i, arr) =>
        arr.findIndex((x: any) => String(x.name).trim().toLowerCase() === String(d.name).trim().toLowerCase()) === i);

    if (newConsumables.length) {
      await prisma.surgeryConsumableRequest.createMany({
        data: newConsumables.map((c: any) => ({
          ...c,
          surgeryId: params.id,
          templateId: c.templateId ?? null,
          requestedById: userId,
          requestedByName: userName,
        })),
      });
    }
    if (newDrugs.length) {
      await prisma.surgeryDrugDressingRequest.createMany({
        data: newDrugs.map((d: any) => ({
          ...d,
          surgeryId: params.id,
          requestedById: userId,
          requestedByName: userName,
        })),
      });
    }

    // AuditLog requires a user. A session without an id should be impossible
    // here, but skipping the entry beats losing the packs to a type error.
    if (userId) await prisma.auditLog.create({
      data: {
        userId,
        action: 'PACK_GENERATED_FROM_PROCEDURE',
        tableName: 'surgeries',
        recordId: params.id,
        changes: JSON.stringify({
          procedure: surgery.procedureName,
          consumablesAdded: newConsumables.length,
          drugsAdded: newDrugs.length,
          unmapped: mapped.unmapped,
        }),
      },
    }).catch(() => { /* an audit failure must not lose the pack */ });

    return NextResponse.json({
      ok: true,
      consumablesAdded: newConsumables.length,
      drugsAdded: newDrugs.length,
      // Named, so a surgeon can see the mapping is incomplete rather than
      // assuming the procedure genuinely needs nothing.
      unmapped: mapped.unmapped ?? [],
      message:
        newConsumables.length + newDrugs.length === 0
          ? 'Everything the standard pack contains is already on this case.'
          : `Added ${newConsumables.length} consumable(s) and ${newDrugs.length} drug/dressing item(s).`,
    });
  } catch (error) {
    console.error('[pack/generate] failed:', error);
    return NextResponse.json(
      { error: 'The packs could not be generated. Please try again.' },
      { status: 500 },
    );
  }
}
