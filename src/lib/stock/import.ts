// ============================================================
// Bulk import — validate, preview, then commit
// ------------------------------------------------------------
// A tertiary hospital does not key thousands of catalogue items by hand, so
// this exists. But an import that half-succeeds is worse than one that fails:
// it leaves a catalogue nobody can trust and no obvious way back. So the shape
// is deliberately strict.
//
//   PARSE   → rows become typed values, or errors naming the row and column
//   VALIDATE→ every row is checked, and checking never stops at the first fault
//   PREVIEW → the operator sees what would be created, updated and skipped
//   COMMIT  → one transaction; any failure rolls the whole thing back
//
// Two rules worth stating outright.
//
// VALIDATION IS EXHAUSTIVE. A spreadsheet with forty faults should report forty
// faults, not the first one. Fixing errors one upload at a time is how people
// give up and go back to typing.
//
// DUPLICATES ARE FOUND TWICE — within the file, and against what is already
// stored. A file containing the same item twice is a mistake in the file; a row
// matching something already there is an update, and the operator should be
// told which it is before anything is written.
//
// Everything here is pure. The route parses the workbook and persists the
// outcome; what counts as valid is decided by functions that need no database.
// ============================================================

export type ImportKind = 'ITEMS' | 'VENDORS' | 'TARIFFS' | 'STOCK';

export interface ColumnSpec {
  /** Header as it appears in the sheet, matched case- and space-insensitively. */
  header: string;
  field: string;
  required?: boolean;
  type: 'text' | 'integer' | 'money' | 'date' | 'enum';
  /** For `enum`. Values are compared upper-case. */
  values?: string[];
  max?: number;
  min?: number;
  /** Part of the key used to spot duplicates. */
  key?: boolean;
  hint?: string;
}

export const IMPORT_SPECS: Record<ImportKind, { label: string; columns: ColumnSpec[] }> = {
  ITEMS: {
    label: 'Catalogue items (consumables, drugs, implants)',
    columns: [
      { header: 'Item Name', field: 'name', required: true, type: 'text', max: 200, key: true },
      { header: 'Category', field: 'category', required: true, type: 'enum', values: ['CONSUMABLE', 'MACHINE', 'DEVICE', 'OTHER'] },
      { header: 'Description', field: 'description', type: 'text', max: 500 },
      { header: 'Unit Cost (Naira)', field: 'unitCostPrice', type: 'money', min: 0, hint: 'In naira, e.g. 2500.00' },
      { header: 'Reorder Level', field: 'reorderLevel', type: 'integer', min: 0 },
      { header: 'Supplier', field: 'supplier', type: 'text', max: 200 },
    ],
  },
  VENDORS: {
    label: 'Vendors and suppliers',
    columns: [
      { header: 'Vendor Name', field: 'name', required: true, type: 'text', max: 200, key: true },
      { header: 'Phone', field: 'phone', type: 'text', max: 40 },
      { header: 'Address', field: 'address', type: 'text', max: 300 },
      { header: 'Bank Name', field: 'bankName', type: 'text', max: 120 },
      { header: 'Account Number', field: 'accountNumber', type: 'text', max: 30 },
    ],
  },
  TARIFFS: {
    label: 'Prices',
    columns: [
      { header: 'Code', field: 'code', required: true, type: 'text', max: 64, key: true },
      { header: 'Name', field: 'name', required: true, type: 'text', max: 200 },
      {
        header: 'Charge Kind',
        field: 'kind',
        required: true,
        type: 'enum',
        values: ['PROCEDURE', 'THEATRE', 'ANAESTHESIA', 'CONSUMABLE', 'DRUG', 'IMPLANT', 'CSSD', 'RECOVERY', 'LABORATORY', 'BLOOD', 'OXYGEN', 'EMERGENCY', 'OTHER'],
      },
      { header: 'Amount (Naira)', field: 'amount', required: true, type: 'money', min: 0 },
      { header: 'Effective From', field: 'effectiveFrom', required: true, type: 'date', hint: 'YYYY-MM-DD' },
      { header: 'Reason', field: 'reason', type: 'text', max: 300 },
    ],
  },
  STOCK: {
    label: 'Opening stock',
    columns: [
      { header: 'Item Name', field: 'itemName', required: true, type: 'text', max: 200, key: true },
      { header: 'Batch Number', field: 'batchNumber', required: true, type: 'text', max: 64, key: true },
      { header: 'Store Code', field: 'locationCode', type: 'text', max: 32, hint: 'e.g. TSU-CONS' },
      { header: 'Quantity', field: 'quantity', required: true, type: 'integer', min: 1 },
      { header: 'Expiry Date', field: 'expiryDate', type: 'date', hint: 'YYYY-MM-DD' },
      { header: 'Purchase Price (Naira)', field: 'purchasePrice', type: 'money', min: 0 },
      { header: 'Selling Price (Naira)', field: 'sellingPrice', type: 'money', min: 0 },
      { header: 'Owner', field: 'owner', type: 'enum', values: ['HOSPITAL', 'VENDOR', 'CSSD', 'THEATRE'] },
      { header: 'Vendor Name', field: 'vendorName', type: 'text', max: 200, hint: 'Required when Owner is VENDOR' },
    ],
  },
};

export interface RowError {
  /** 1-based, and counting the header — so it matches what the operator sees. */
  row: number;
  column: string;
  value: string;
  message: string;
}

export interface ParsedRow {
  row: number;
  values: Record<string, string | number | Date | null>;
  /** Key used for duplicate detection, built from the `key` columns. */
  key: string;
}

export interface ImportPreview {
  kind: ImportKind;
  totalRows: number;
  valid: ParsedRow[];
  errors: RowError[];
  /** Rows whose key appears more than once in the FILE. */
  duplicatesInFile: Array<{ key: string; rows: number[] }>;
  /** Keys that already exist in the database — these would be updates. */
  existingKeys: string[];
  summary: {
    toCreate: number;
    toUpdate: number;
    rejected: number;
  };
}

/** Headers match loosely: case, spacing and punctuation should not defeat an import. */
function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Map the sheet's header row onto the spec.
 *
 * A missing REQUIRED column is fatal and reported before any row is read —
 * validating two thousand rows against the wrong columns wastes everybody's
 * time and produces a frightening error report.
 */
export function mapHeaders(
  spec: ColumnSpec[],
  headers: string[]
): { index: Record<string, number>; missing: string[] } {
  const normalised = headers.map(normaliseHeader);
  const index: Record<string, number> = {};
  const missing: string[] = [];

  for (const col of spec) {
    const at = normalised.indexOf(normaliseHeader(col.header));
    if (at === -1) {
      if (col.required) missing.push(col.header);
      continue;
    }
    index[col.field] = at;
  }

  return { index, missing };
}

/** Naira as typed by a person → integer kobo. Rejects anything that is not a number. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[₦,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // Rounded once, here. Two decimal places of naira is exactly one kobo.
  return Math.round(value * 100);
}

/**
 * Build a date, refusing one whose parts do not survive the round trip.
 *
 * Date.UTC happily rolls 2026-13-45 forward into February 2027 rather than
 * failing, which would silently move an expiry date by months. So the
 * constructed date is read back and compared: if it is not the day that was
 * asked for, the input was not a real date.
 */
function makeDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // ISO first, because that is what the template asks for and what Excel
  // exports when the cell is a real date.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // dd/mm/yyyy, which is what a Nigerian clerk will type. Deliberately NOT
  // mm/dd — guessing wrongly here silently shifts expiry dates.
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) return makeDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  return null;
}

/**
 * Validate one cell. Returns the parsed value, or an error describing what is
 * wrong in terms the person holding the spreadsheet can act on.
 */
export function validateCell(
  col: ColumnSpec,
  raw: string,
  rowNumber: number
): { value: string | number | Date | null; error: RowError | null } {
  const text = (raw ?? '').toString().trim();

  if (!text) {
    if (col.required) {
      return {
        value: null,
        error: { row: rowNumber, column: col.header, value: '', message: `${col.header} is required.` },
      };
    }
    return { value: null, error: null };
  }

  const fail = (message: string): { value: null; error: RowError } => ({
    value: null,
    error: { row: rowNumber, column: col.header, value: text, message },
  });

  switch (col.type) {
    case 'text':
      if (col.max && text.length > col.max) {
        return fail(`${col.header} is longer than ${col.max} characters.`);
      }
      return { value: text, error: null };

    case 'integer': {
      const n = Number(text.replace(/[,\s]/g, ''));
      if (!Number.isInteger(n)) return fail(`${col.header} must be a whole number.`);
      if (col.min != null && n < col.min) return fail(`${col.header} cannot be less than ${col.min}.`);
      if (col.max != null && n > col.max) return fail(`${col.header} cannot be more than ${col.max}.`);
      return { value: n, error: null };
    }

    case 'money': {
      const kobo = parseMoney(text);
      if (kobo === null) return fail(`${col.header} must be an amount, for example 2500.00`);
      if (col.min != null && kobo < col.min * 100) return fail(`${col.header} cannot be negative.`);
      return { value: kobo, error: null };
    }

    case 'date': {
      const d = parseDate(text);
      if (!d) return fail(`${col.header} must be a date as YYYY-MM-DD or DD/MM/YYYY.`);
      return { value: d, error: null };
    }

    case 'enum': {
      const upper = text.toUpperCase();
      if (!col.values?.includes(upper)) {
        return fail(`${col.header} must be one of: ${col.values?.join(', ')}.`);
      }
      return { value: upper, error: null };
    }

    default:
      return { value: text, error: null };
  }
}

/**
 * Validate a whole sheet.
 *
 * `rows` are the data rows only; row numbers reported are 1-based INCLUDING the
 * header, so they match what the operator sees in Excel.
 */
export function validateSheet(params: {
  kind: ImportKind;
  headers: string[];
  rows: string[][];
  /** Keys already in the database, so the preview can say create versus update. */
  existingKeys?: string[];
}): ImportPreview {
  const { kind, headers, rows, existingKeys = [] } = params;
  const spec = IMPORT_SPECS[kind].columns;
  const { index, missing } = mapHeaders(spec, headers);

  if (missing.length > 0) {
    return {
      kind,
      totalRows: rows.length,
      valid: [],
      errors: [
        {
          row: 1,
          column: missing.join(', '),
          value: '',
          message: `The sheet is missing required column(s): ${missing.join(', ')}. Download the template and use its headings.`,
        },
      ],
      duplicatesInFile: [],
      existingKeys: [],
      summary: { toCreate: 0, toUpdate: 0, rejected: rows.length },
    };
  }

  const errors: RowError[] = [];
  const parsed: ParsedRow[] = [];
  const keyColumns = spec.filter((c) => c.key);

  rows.forEach((cells, i) => {
    // +2: one for the header, one because spreadsheets count from 1.
    const rowNumber = i + 2;

    // A wholly blank row is trailing whitespace in the file, not a fault.
    if (cells.every((c) => !String(c ?? '').trim())) return;

    const values: Record<string, string | number | Date | null> = {};
    let rowFailed = false;

    for (const col of spec) {
      const at = index[col.field];
      const raw = at == null ? '' : String(cells[at] ?? '');
      const { value, error } = validateCell(col, raw, rowNumber);
      // Every column is checked even after one fails, so the operator gets the
      // whole picture in one pass.
      if (error) {
        errors.push(error);
        rowFailed = true;
      } else {
        values[col.field] = value;
      }
    }

    // Cross-field rules that only make sense once the row is parsed.
    if (!rowFailed && kind === 'STOCK' && values.owner === 'VENDOR' && !values.vendorName) {
      errors.push({
        row: rowNumber,
        column: 'Vendor Name',
        value: '',
        message: 'Consignment stock must name the vendor that owns it.',
      });
      rowFailed = true;
    }

    if (rowFailed) return;

    const key = keyColumns
      .map((c) => String(values[c.field] ?? '').trim().toLowerCase())
      .join('||');
    parsed.push({ row: rowNumber, values, key });
  });

  // Duplicates within the file.
  const seen = new Map<string, number[]>();
  for (const p of parsed) {
    seen.set(p.key, [...(seen.get(p.key) ?? []), p.row]);
  }
  const duplicatesInFile = Array.from(seen.entries())
    .filter(([, rowNumbers]) => rowNumbers.length > 1)
    .map(([key, rowNumbers]) => ({ key, rows: rowNumbers }));

  // A duplicated key is ambiguous — which of the two rows is the truth? So
  // every copy is rejected rather than silently taking the last one.
  const duplicateKeys = new Set(duplicatesInFile.map((d) => d.key));
  for (const d of duplicatesInFile) {
    for (const row of d.rows) {
      errors.push({
        row,
        column: keyColumns.map((c) => c.header).join(' + '),
        value: d.key.replace(/\|\|/g, ' + '),
        message: `This appears on rows ${d.rows.join(', ')}. Remove the duplicates so it is clear which is correct.`,
      });
    }
  }

  const usable = parsed.filter((p) => !duplicateKeys.has(p.key));
  const existing = new Set(existingKeys.map((k) => k.toLowerCase()));
  const matched = usable.filter((p) => existing.has(p.key));

  return {
    kind,
    totalRows: rows.length,
    valid: usable,
    errors,
    duplicatesInFile,
    existingKeys: matched.map((p) => p.key),
    summary: {
      toCreate: usable.length - matched.length,
      toUpdate: matched.length,
      rejected: rows.length - usable.length,
    },
  };
}

/**
 * Should this import be allowed to commit?
 *
 * Any error at all blocks it. A partial import leaves a catalogue nobody can
 * trust, and "it mostly worked" is not a state anybody can reason about.
 */
export function canCommit(preview: ImportPreview): { allowed: boolean; message?: string } {
  if (preview.errors.length > 0) {
    return {
      allowed: false,
      message: `${preview.errors.length} problem(s) across ${new Set(preview.errors.map((e) => e.row)).size} row(s). Fix them and upload again — nothing has been changed.`,
    };
  }
  if (preview.valid.length === 0) {
    return { allowed: false, message: 'There is nothing to import.' };
  }
  return { allowed: true };
}

/** The error report, as CSV, so it opens in the tool the file came from. */
export function errorsToCsv(errors: RowError[]): string {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const header = 'Row,Column,Value,Problem';
  const lines = errors.map((e) => [e.row, e.column, e.value, e.message].map((x) => escape(String(x))).join(','));
  return [header, ...lines].join('\n');
}
