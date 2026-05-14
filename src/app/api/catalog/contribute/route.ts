/**
 * POST /api/catalog/contribute
 * --------------------------------------------------------------
 * Crowdsourced catalog contributions from any authenticated user
 * (typically a sub-specialty surgeon submitting via the shareable
 * /dashboard/catalog-contribute form).
 *
 * Behaviour:
 *   - Authenticated users only (any role).
 *   - Accepts { specialty, consumables[], drugs[] }.
 *   - Dedupe by case-insensitive (name, category|type, specialty)
 *     against existing rows. Duplicates are skipped (not overwritten)
 *     so admin curation is preserved.
 *   - New rows are stamped with submitter info in the `notes` field.
 *   - Returns counts: { consumablesCreated, consumablesSkipped,
 *                       drugsCreated, drugsSkipped }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const consumableCategoryEnum = z.enum([
  'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
  'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
  'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
]);

const drugTypeEnum = z.enum([
  'ANTIBIOTIC', 'ANALGESIC', 'ANAESTHETIC_ADJUNCT', 'IV_FLUID',
  'WOUND_DRESSING_AGENT', 'ANTISEPTIC', 'HAEMOSTATIC', 'OTHER',
]);

const consumableInput = z.object({
  name: z.string().trim().min(1).max(200),
  category: consumableCategoryEnum.default('OTHER'),
  size: z.string().trim().max(80).optional().nullable(),
  unit: z.string().trim().min(1).max(40).default('piece'),
  defaultQuantity: z.number().int().min(1).max(1000).default(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

const drugInput = z.object({
  name: z.string().trim().min(1).max(200),
  type: drugTypeEnum.default('OTHER'),
  defaultDosage: z.string().trim().max(120).optional().nullable(),
  defaultRoute: z.string().trim().max(40).optional().nullable(),
  defaultQuantity: z.number().int().min(1).max(1000).default(1),
  unit: z.string().trim().min(1).max(40).default('vial'),
  isControlled: z.boolean().default(false),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bodySchema = z.object({
  specialty: z.string().trim().min(2).max(80),
  submittedByName: z.string().trim().max(120).optional(), // optional override (defaults to session user)
  consumables: z.array(consumableInput).max(200).default([]),
  drugs: z.array(drugInput).max(200).default([]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = bodySchema.parse(await req.json());
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.errors }, { status: 400 });
    }
    return NextResponse.json({ error: e.message ?? 'Bad request' }, { status: 400 });
  }

  if (payload.consumables.length === 0 && payload.drugs.length === 0) {
    return NextResponse.json({ error: 'Submit at least one consumable or drug.' }, { status: 400 });
  }

  const submitter =
    payload.submittedByName?.trim() ||
    (session.user as any).name ||
    (session.user as any).email ||
    'unknown';
  const stamp = `Submitted by ${submitter} (${payload.specialty}) on ${new Date().toISOString().slice(0, 10)}`;

  let consumablesCreated = 0;
  let consumablesSkipped = 0;
  let drugsCreated = 0;
  let drugsSkipped = 0;

  // ----- Consumables: dedupe by (name CI, category, specialty) -----
  for (const c of payload.consumables) {
    const existing = await prisma.surgicalConsumableTemplate.findFirst({
      where: {
        category: c.category,
        specialty: payload.specialty,
        name: { equals: c.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      consumablesSkipped++;
      continue;
    }
    await prisma.surgicalConsumableTemplate.create({
      data: {
        name: c.name,
        category: c.category,
        size: c.size || null,
        unit: c.unit,
        specialty: payload.specialty,
        defaultQuantity: c.defaultQuantity,
        isActive: true,
        sortOrder: 0,
        notes: c.notes ? `${c.notes}\n${stamp}` : stamp,
      },
    });
    consumablesCreated++;
  }

  // ----- Drugs: dedupe by (name CI, type, specialty) -----
  for (const d of payload.drugs) {
    const existing = await prisma.surgicalDrugDressingTemplate.findFirst({
      where: {
        type: d.type,
        specialty: payload.specialty,
        name: { equals: d.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      drugsSkipped++;
      continue;
    }
    await prisma.surgicalDrugDressingTemplate.create({
      data: {
        name: d.name,
        type: d.type,
        defaultDosage: d.defaultDosage || null,
        defaultRoute: d.defaultRoute || null,
        defaultQuantity: d.defaultQuantity,
        unit: d.unit,
        specialty: payload.specialty,
        isControlled: d.isControlled,
        isActive: true,
        sortOrder: 0,
        notes: d.notes ? `${d.notes}\n${stamp}` : stamp,
      },
    });
    drugsCreated++;
  }

  return NextResponse.json({
    ok: true,
    specialty: payload.specialty,
    submittedBy: submitter,
    consumablesCreated,
    consumablesSkipped,
    drugsCreated,
    drugsSkipped,
  });
}
