// ============================================================
// The procedure catalogue
// ------------------------------------------------------------
// GET  — what a surgeon may pick, for one subspecialty.
// POST — add one that was not in the list.
//
// The POST is the interesting half. A surgeon choosing "Other" and typing a
// name is adding a permanent entry that every surgeon after them will be
// offered, so:
//
//   * the name is validated more strictly than a free-text box would be —
//     "Other", "misc" and two-character entries are refused;
//   * it is normalised to a slug and matched against what exists, so the
//     same operation typed twice returns the EXISTING row rather than
//     creating a near-duplicate;
//   * the unique constraint is the real guard, and a lost race returns the
//     winner's row instead of an error, because from the user's point of view
//     "it is in the list now" is the correct outcome either way.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  checkProcedureName,
  pickerOrder,
  procedureSlug,
  tidyProcedureName,
} from '@/lib/procedures/normalise';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/procedures?subspecialty=General%20Surgery
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const subspecialty = sp.get('subspecialty')?.trim();

  try {
    const rows = await prisma.surgicalProcedure.findMany({
      where: {
        isActive: true,
        ...(subspecialty ? { subspecialty } : {}),
      },
      select: {
        id: true,
        name: true,
        subspecialty: true,
        category: true,
        isEmergency: true,
        usageCount: true,
        source: true,
      },
      // A generous cap: the whole catalogue is smaller than this, and a
      // dropdown that silently truncated would be worse than a slow one.
      take: 2000,
    });

    const ordered = pickerOrder(rows);

    // Grouped for the picker's optgroups, in a stable order: categories with
    // the most-used procedures first, matching the flat ordering.
    const groups: { category: string; procedures: typeof ordered }[] = [];
    for (const row of ordered) {
      const key = row.category || 'Other procedures';
      const found = groups.find((g) => g.category === key);
      if (found) found.procedures.push(row);
      else groups.push({ category: key, procedures: [row] });
    }

    return NextResponse.json({
      subspecialty: subspecialty ?? null,
      count: ordered.length,
      procedures: ordered,
      groups,
    });
  } catch (error) {
    console.error('[procedures] list failed:', error);
    return NextResponse.json({ error: 'Failed to load the procedure list' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/procedures  — add one that was not in the list
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; fullName?: string; name?: string } | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let body: { name?: string; subspecialty?: string; category?: string; isEmergency?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const subspecialty = body.subspecialty?.trim();
  if (!subspecialty) {
    return NextResponse.json(
      { error: 'Choose the subspecialty first — a procedure belongs to one.' },
      { status: 400 }
    );
  }

  const check = checkProcedureName(body.name ?? '');
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const name = tidyProcedureName(body.name as string);
  const slug = procedureSlug(name);

  try {
    // Already there under any spelling? Return it. The surgeon wanted a
    // procedure in the list; it is, and telling them "that already exists"
    // when the wording differs would just send them round again.
    const existing = await prisma.surgicalProcedure.findUnique({
      where: { subspecialty_slug: { subspecialty, slug } },
      select: { id: true, name: true, subspecialty: true, category: true, isEmergency: true, usageCount: true, source: true, isActive: true },
    });

    if (existing) {
      // A previously retired entry that somebody has just asked for again is
      // evidently still in use. Bring it back rather than making them wonder
      // why their procedure will not save.
      if (!existing.isActive) {
        const revived = await prisma.surgicalProcedure.update({
          where: { id: existing.id },
          data: { isActive: true },
          select: { id: true, name: true, subspecialty: true, category: true, isEmergency: true, usageCount: true, source: true },
        });
        return NextResponse.json({ procedure: revived, created: false, revived: true });
      }
      return NextResponse.json({ procedure: existing, created: false, alreadyExisted: true });
    }

    const created = await prisma.surgicalProcedure.create({
      data: {
        name,
        subspecialty,
        slug,
        category: body.category?.trim() || 'Added by staff',
        source: 'USER_ADDED',
        isEmergency: !!body.isEmergency,
        createdById: me.id,
        createdByName: me.fullName ?? me.name ?? null,
      },
      select: { id: true, name: true, subspecialty: true, category: true, isEmergency: true, usageCount: true, source: true },
    });

    return NextResponse.json({ procedure: created, created: true }, { status: 201 });
  } catch (error: unknown) {
    // Lost the race against a concurrent add of the same name. The other
    // request won; return its row. "It is in the list now" is true either way.
    if ((error as { code?: string })?.code === 'P2002') {
      const winner = await prisma.surgicalProcedure.findUnique({
        where: { subspecialty_slug: { subspecialty, slug } },
        select: { id: true, name: true, subspecialty: true, category: true, isEmergency: true, usageCount: true, source: true },
      });
      if (winner) return NextResponse.json({ procedure: winner, created: false, alreadyExisted: true });
    }
    console.error('[procedures] add failed:', error);
    return NextResponse.json({ error: 'Failed to add the procedure' }, { status: 500 });
  }
}
