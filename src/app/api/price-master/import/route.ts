import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { CHARGE_KINDS } from '@/lib/estimates/chargeKinds';
import { parsePriceRows, splitDelimited, type ParsedPrice } from '@/lib/estimates/priceImport';

export const dynamic = 'force-dynamic';

/**
 * POST /api/price-master/import
 *
 *   { text, apply: false }  → validate only, change nothing
 *   { text, apply: true }   → commit the valid rows in ONE transaction
 *
 * Every row becomes a `Tariff` — the existing effective-dated price master. No
 * new pricing table, so there is only ever one answer to "what did this cost in
 * August".
 *
 * A price is never UPDATED. Superseding writes effectiveTo on the current row
 * and inserts a new one, which is what keeps historical estimates readable:
 * they snapshot the price they were built from, and the row behind that
 * snapshot stays exactly as it was.
 */

/** Only these roles may change what the hospital charges patients. */
const PRICE_ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

/**
 * Ward is folded into the tariff code for admission charges.
 *
 * `Tariff` has no ward column, and adding one would mean a migration to the
 * live price master for a single kind of charge. Encoding it in the code keeps
 * each ward's daily rate uniquely identifiable and separately supersedable,
 * which is what actually matters.
 */
const tariffCode = (p: ParsedPrice) =>
  p.ward ? `${p.code}::${p.ward.trim().toUpperCase()}` : p.code;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!PRICE_ADMIN_ROLES.includes(user.role ?? '')) {
    return NextResponse.json(
      { error: 'Only an administrator may change prices.' }, { status: 403 });
  }

  let body: { text?: string; apply?: boolean; defaultEffectiveFrom?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const result = parsePriceRows(splitDelimited(text), {
    validKinds: CHARGE_KINDS,
    defaultEffectiveFrom: body.defaultEffectiveFrom || today,
  });

  // Validation always runs first and is reported whole. The caller decides
  // whether to commit having SEEN the faults, rather than discovering them
  // half way through a 500-row file.
  const summary = {
    valid: result.valid.length,
    invalid: result.invalid.length,
    duplicates: result.duplicates.length,
    skipped: result.skipped,
  };

  if (!body.apply) {
    return NextResponse.json({
      applied: false, summary,
      preview: result.valid.slice(0, 200),
      invalid: result.invalid,
      duplicateRows: result.duplicates,
    });
  }

  // Refuse a partial commit. A price list where some rows landed and some did
  // not is worse than one that was rejected, because nobody can tell which.
  if (result.invalid.length || result.duplicates.length) {
    return NextResponse.json({
      error: 'Fix the faults first — nothing was imported.',
      applied: false, summary,
      invalid: result.invalid, duplicateRows: result.duplicates,
    }, { status: 400 });
  }
  if (!result.valid.length) {
    return NextResponse.json({ error: 'No valid rows to import.' }, { status: 400 });
  }

  let superseded = 0;
  let inserted = 0;

  await prisma.$transaction(async (tx) => {
    for (const p of result.valid) {
      const code = tariffCode(p);
      const from = new Date(`${p.effectiveFrom}T00:00:00Z`);

      // Close whatever is currently open for this code and kind. The old row
      // keeps its amount; only its window ends. That is what lets an estimate
      // written in August still be explained in September.
      const closed = await tx.tariff.updateMany({
        where: { code, kind: p.kind as never, effectiveTo: null, effectiveFrom: { lt: from } },
        data: { effectiveTo: from },
      });
      superseded += closed.count;

      await tx.tariff.create({
        data: {
          code,
          name: p.name,
          kind: p.kind as never,
          amount: p.amountKobo,
          effectiveFrom: from,
          reason: p.reason ?? 'Bulk price upload',
          notes: p.notes ?? (p.ward ? `Ward: ${p.ward}` : null),
          createdById: user.id ?? null,
        },
      });
      inserted++;
    }

    // Who changed the hospital's prices, and when, is the first question an
    // auditor asks.
    if (user.id) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'PRICE_MASTER_IMPORT',
          tableName: 'tariffs',
          changes: JSON.stringify({ inserted, superseded, kinds: Array.from(new Set(result.valid.map((v) => v.kind))) }),
        },
      });
    }
  }, { timeout: 120_000 });

  return NextResponse.json({ applied: true, summary, inserted, superseded });
}
