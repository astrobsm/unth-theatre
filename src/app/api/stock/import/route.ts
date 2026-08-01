// ============================================================
// Bulk import — template out, spreadsheet in
// ------------------------------------------------------------
// GET   returns an .xlsx template with the right headings, so the commonest
//       cause of a failed import — wrong column names — mostly disappears.
// POST  validates and, on request, commits.
//
// Commit runs inside ONE transaction. Any failure rolls back the whole file,
// because a half-imported catalogue is worse than no import: nobody can tell
// which half is there.
//
// Validation itself is in lib/stock/import, tested without a database. This
// route reads the workbook, asks the database which keys already exist, and
// persists the result.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { canCommit, ImportKind, IMPORT_SPECS, validateSheet } from '@/lib/stock/import';
import { generateBatchCode, qrPayloadFor } from '@/lib/stock/barcode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KINDS: ImportKind[] = ['ITEMS', 'VENDORS', 'TARIFFS', 'STOCK'];

// ---------------------------------------------------------------------------
// GET — download the template
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const kind = (request.nextUrl.searchParams.get('kind') ?? 'ITEMS') as ImportKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `Unknown import "${kind}".`, available: KINDS }, { status: 400 });
  }

  const spec = IMPORT_SPECS[kind];

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'UNTH Theatre — Supply Chain';
    const ws = wb.addWorksheet(kind.slice(0, 31));

    spec.columns.forEach((col, i) => {
      const cell = ws.getCell(1, i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.required ? 'FF991B1B' : 'FF1E40AF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      ws.getColumn(i + 1).width = Math.max(16, col.header.length + 4);

      // The guidance goes in a note rather than a second header row, so the
      // sheet can be filled in and uploaded without deleting anything.
      const parts = [col.required ? 'Required.' : 'Optional.'];
      if (col.values) parts.push(`One of: ${col.values.join(', ')}`);
      if (col.hint) parts.push(col.hint);
      if (col.max) parts.push(`Maximum ${col.max} characters.`);
      cell.note = parts.join(' ');
    });

    // A worked example on row 2, marked so it is obviously not real data.
    const example = spec.columns.map((col) => {
      if (col.values) return col.values[0];
      if (col.type === 'date') return '2027-06-30';
      if (col.type === 'money') return 2500;
      if (col.type === 'integer') return 10;
      return `example ${col.header.toLowerCase()}`;
    });
    const exampleRow = ws.getRow(2);
    exampleRow.values = example;
    exampleRow.font = { italic: true, color: { argb: 'FF9CA3AF' } };
    ws.getCell(2, 1).note = 'Example row — delete it before uploading.';

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="import-${kind.toLowerCase()}-template.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[stock] template failed:', error);
    return NextResponse.json({ error: 'Failed to produce the template' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — validate, and optionally commit
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { kind?: ImportKind; fileDataUrl?: string; commit?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const kind = body.kind;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Which import? Choose items, vendors, prices or stock.' }, { status: 400 });
  }
  if (!body.fileDataUrl) {
    return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
  }

  try {
    // --- Read the workbook ------------------------------------------------
    const match = /^data:[^;,]*;base64,([\s\S]+)$/.exec(body.fileDataUrl);
    if (!match) return NextResponse.json({ error: 'The file could not be read.' }, { status: 400 });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(match[1], 'base64') as never);
    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: 'That workbook has no sheets.' }, { status: 400 });

    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });

    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        // A date cell arrives as a Date; render it back to ISO so the same
        // validator handles typed and formatted dates identically.
        cells[col - 1] =
          v instanceof Date
            ? v.toISOString().slice(0, 10)
            : v && typeof v === 'object' && 'result' in (v as object)
              ? String((v as { result: unknown }).result ?? '')
              : String(v ?? '');
      });
      rows.push(cells);
    });

    if (rows.length > 5000) {
      return NextResponse.json(
        { error: `That file has ${rows.length} rows. Split it into files of 5,000 or fewer.` },
        { status: 413 }
      );
    }

    // --- What already exists ----------------------------------------------
    const existingKeys = await loadExistingKeys(kind);
    const preview = validateSheet({ kind, headers, rows, existingKeys });

    if (!body.commit) {
      return NextResponse.json({ preview, committed: false });
    }

    const verdict = canCommit(preview);
    if (!verdict.allowed) {
      return NextResponse.json(
        { preview, committed: false, error: verdict.message },
        { status: 422 }
      );
    }

    // --- Commit, all or nothing -------------------------------------------
    const written = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;

      for (const row of preview.valid) {
        const v = row.values;

        if (kind === 'ITEMS') {
          const existing = await tx.inventoryItem.findFirst({
            where: { name: { equals: String(v.name), mode: 'insensitive' } },
          });
          const data = {
            name: String(v.name),
            category: v.category as never,
            description: (v.description as string) ?? null,
            // The catalogue's own price column predates the supply chain and is
            // Decimal naira, so kobo is converted back for it.
            unitCostPrice: ((v.unitCostPrice as number) ?? 0) / 100,
            reorderLevel: (v.reorderLevel as number) ?? 10,
            supplier: (v.supplier as string) ?? null,
          };
          if (existing) {
            await tx.inventoryItem.update({ where: { id: existing.id }, data });
            updated += 1;
          } else {
            await tx.inventoryItem.create({ data: { ...data, quantity: 0 } });
            created += 1;
          }
        }

        if (kind === 'VENDORS') {
          const existing = await tx.vendor.findFirst({
            where: { name: { equals: String(v.name), mode: 'insensitive' }, deletedAt: null },
          });
          const data = {
            name: String(v.name),
            phone: (v.phone as string) ?? null,
            address: (v.address as string) ?? null,
            bankName: (v.bankName as string) ?? null,
            accountNumber: (v.accountNumber as string) ?? null,
          };
          if (existing) {
            await tx.vendor.update({ where: { id: existing.id }, data });
            updated += 1;
          } else {
            await tx.vendor.create({ data });
            created += 1;
          }
        }

        if (kind === 'TARIFFS') {
          // Superseding, not editing: the current price is closed on the day the
          // new one starts, so past bills still reprice to what they charged.
          const current = await tx.tariff.findFirst({
            where: { code: String(v.code), effectiveTo: null },
            orderBy: { effectiveFrom: 'desc' },
          });
          const from = v.effectiveFrom as Date;
          if (current) {
            if (current.amount === (v.amount as number)) continue; // no real change
            await tx.tariff.update({ where: { id: current.id }, data: { effectiveTo: from } });
            updated += 1;
          } else {
            created += 1;
          }
          await tx.tariff.create({
            data: {
              code: String(v.code),
              name: String(v.name),
              kind: v.kind as never,
              amount: v.amount as number,
              effectiveFrom: from,
              reason: (v.reason as string) ?? 'Bulk import',
              createdById: actor.userId,
            },
          });
        }

        if (kind === 'STOCK') {
          const item = await tx.inventoryItem.findFirst({
            where: { name: { equals: String(v.itemName), mode: 'insensitive' } },
          });
          if (!item) {
            // Rolls the whole file back — an opening-stock line for an item
            // that is not in the catalogue is a mistake worth stopping for.
            throw new Error(
              `Row ${row.row}: "${v.itemName}" is not in the catalogue. Import the items first.`
            );
          }
          const location = v.locationCode
            ? await tx.stockLocation.findUnique({ where: { code: String(v.locationCode) } })
            : null;
          if (v.locationCode && !location) {
            throw new Error(`Row ${row.row}: no store has the code "${v.locationCode}".`);
          }
          const vendor = v.vendorName
            ? await tx.vendor.findFirst({
                where: { name: { equals: String(v.vendorName), mode: 'insensitive' }, deletedAt: null },
              })
            : null;
          if (v.vendorName && !vendor) {
            throw new Error(`Row ${row.row}: "${v.vendorName}" is not on the vendor register.`);
          }

          const code = generateBatchCode();
          const batch = await tx.stockBatch.create({
            data: {
              itemId: item.id,
              locationId: location?.id ?? null,
              batchNumber: String(v.batchNumber),
              expiryDate: (v.expiryDate as Date) ?? null,
              quantityReceived: v.quantity as number,
              purchasePrice: (v.purchasePrice as number) ?? 0,
              sellingPrice: (v.sellingPrice as number) ?? 0,
              owner: (v.owner as never) ?? 'HOSPITAL',
              vendorId: vendor?.id ?? null,
              barcode: code,
              qrPayload: qrPayloadFor(code, request.nextUrl.origin),
              createdById: actor.userId,
            },
          });
          // Opening stock is still a receipt, and gets the movement that
          // explains it like any other.
          await tx.stockMovement.create({
            data: {
              batchId: batch.id,
              type: 'RECEIVE',
              quantity: v.quantity as number,
              actorId: actor.userId,
              actorName: actor.fullName,
              reason: 'Opening stock, bulk import',
            },
          });
          created += 1;
        }
      }

      return { created, updated };
    });

    return NextResponse.json({
      preview,
      committed: true,
      ...written,
      message: `${written.created} created, ${written.updated} updated.`,
    });
  } catch (error) {
    const message = (error as Error).message;
    console.error('[stock] import failed:', error);
    return NextResponse.json(
      {
        committed: false,
        // A row-level failure names its row, and nothing was written.
        error: message.startsWith('Row ')
          ? `${message} Nothing has been imported.`
          : 'The import failed and nothing was changed.',
      },
      { status: 422 }
    );
  }
}

/** Keys already stored, so the preview can say create versus update. */
async function loadExistingKeys(kind: ImportKind): Promise<string[]> {
  if (kind === 'ITEMS') {
    const rows = await prisma.inventoryItem.findMany({ select: { name: true } });
    return rows.map((r) => r.name.trim().toLowerCase());
  }
  if (kind === 'VENDORS') {
    const rows = await prisma.vendor.findMany({ where: { deletedAt: null }, select: { name: true } });
    return rows.map((r) => r.name.trim().toLowerCase());
  }
  if (kind === 'TARIFFS') {
    const rows = await prisma.tariff.findMany({ where: { effectiveTo: null }, select: { code: true } });
    return rows.map((r) => r.code.trim().toLowerCase());
  }
  const rows = await prisma.stockBatch.findMany({
    where: { deletedAt: null },
    select: { batchNumber: true, item: { select: { name: true } } },
  });
  return rows.map((r) => `${r.item.name.trim().toLowerCase()}||${r.batchNumber.trim().toLowerCase()}`);
}
