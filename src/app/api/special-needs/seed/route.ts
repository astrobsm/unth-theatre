// ============================================================
// Loading the standard catalogue
// ------------------------------------------------------------
//   GET  — how many items are in the catalogue, by category, so the button
//          can say what it would do before anybody presses it.
//   POST — add any standard item that is missing.
//
// DELIBERATELY NOT RUN BY THE BUILD. Seeding several hundred rows as a side
// effect of a deployment, on the same run that creates the tables, turns one
// bad insert into a blocked release — and on this project a failed migration
// step stops everything shipping. An administrator pressing a button can see
// what happened and try again; a build cannot.
//
// Safe to press repeatedly: seedStandardCatalogue matches on
// (category, name, size, brand) and never deletes, so locally added brands
// and sizes survive it.
// ============================================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { seedStandardCatalogue } from '@/lib/specialNeeds/seed';
import { standardCatalogue } from '@/lib/specialNeeds/standardCatalogue';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'THEATRE_STORE_KEEPER',
  'HEAD_OF_PHARMACY',
] as const;

export async function GET() {
  const { error } = await requireRole(ADMIN_ROLES as never);
  if (error) return error;

  try {
    const [total, locallyAdded, byCategory] = await Promise.all([
      prisma.specialNeedItem.count(),
      prisma.specialNeedItem.count({ where: { isLocallyAdded: true } }),
      prisma.specialNeedItem.groupBy({ by: ['category'], _count: true }),
    ]);

    return NextResponse.json({
      total,
      locallyAdded,
      standardAvailable: standardCatalogue().length,
      byCategory: byCategory
        .map((c) => ({ category: c.category, count: c._count }))
        .sort((a, b) => a.category.localeCompare(b.category)),
    });
  } catch (err) {
    console.error('[special-needs/seed] count failed:', err);
    return NextResponse.json({ error: 'Could not read the catalogue' }, { status: 500 });
  }
}

export async function POST() {
  const { error } = await requireRole(ADMIN_ROLES as never);
  if (error) return error;

  try {
    const result = await seedStandardCatalogue();
    const total = await prisma.specialNeedItem.count();
    return NextResponse.json({ ...result, total });
  } catch (err) {
    console.error('[special-needs/seed] seeding failed:', err);
    return NextResponse.json(
      { error: 'Could not load the catalogue. Nothing was changed that was already there.' },
      { status: 500 },
    );
  }
}
