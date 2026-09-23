/**
 * Does a blob column know not to travel on every unrelated edit?
 *
 * WHAT THIS EXISTS TO PREVENT, stated as it actually happened.
 *
 * announcements.audioData holds an MP3 as base64 — about 1.4 MB a row. The
 * announcement scheduler bumps playCount and lastPlayedAt each time one plays.
 * The capture trigger serialises the WHOLE row, so every play wrote another
 * 1.4 MB journal entry to convey two integers. On 23 September 2026 that one
 * table accounted for 385 MB of a journal whose other ~50,000 entries came to
 * under 2 MB between them.
 *
 * The damage was not disk. The push batch is bounded by a byte budget, so a
 * single one of those entries filled a batch on its own — "sending 12 of 200
 * queued (byte budget reached)". After a three-day outage the theatre server
 * had 2,721 entries to send and 42 audio files sitting at the front of the
 * queue. Surgeries booked on the cloud did not appear locally because they
 * were behind audio files they had nothing to do with. The sync was never
 * broken; it was carrying the wrong thing.
 *
 * sync_omitted_columns had existed since the first sync migration and knew
 * about the consent blobs on surgeries. Nothing connected it to the schema, so
 * a new blob column was registered only if somebody remembered.
 *
 * THE OTHER HALF, which is why this suite checks two things rather than one.
 * The obvious fix — register audioData and never ship it — is wrong, and
 * wrong in a way that fails silently on the far node. audioData is NOT NULL.
 * Omit it from the INSERT that first carries a new announcement and the peer's
 * apply violates the not-null constraint, every retry, for ever, because
 * nothing else will ever supply the bytes. Hence when_unchanged: ship the
 * column when it is genuinely new or genuinely changed, omit it otherwise.
 *
 * So: a required column may only be registered conditionally.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');
const MIGRATIONS = path.join(ROOT, 'prisma/migrations');

interface Column {
  table: string;
  column: string;
  /** A base64 payload, by the schema's own description of it. */
  blob: boolean;
  /** Optional in Prisma — `String?` — and therefore nullable in Postgres. */
  nullable: boolean;
}

/**
 * The columns the schema declares, with the two facts this suite needs.
 *
 * Deliberately a small hand-rolled reader rather than a Prisma AST: the
 * question is "what does the file say", and a parser that understood the
 * schema more deeply would not answer it any better.
 */
function schemaColumns(): Column[] {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  const out: Column[] = [];

  // model Foo { ... }  — non-greedy to the first closing brace at column 0.
  for (const m of sql.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const body = m[2];
    // The table name Postgres actually uses. Without @@map a Prisma model is
    // its own table name, which is true of a few models here.
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const table = mapped ? mapped[1] : m[1];

    for (const line of body.split('\n')) {
      // fieldName  Type  ...attributes  // comment
      const f = line.match(/^\s{2}(\w+)\s+(\w+)(\?)?(\[\])?\s*(.*)$/);
      if (!f) continue;
      const [, column, , optional, list, rest] = f;
      // Relation fields and block attributes are not columns.
      if (/@relation\(/.test(rest) && !/@db\./.test(rest)) continue;
      if (list) continue;

      out.push({
        table,
        column,
        blob: /base64/i.test(rest),
        nullable: Boolean(optional),
      });
    }
  }
  return out;
}

/** Capture is switched on somewhere for these. Mirrors syncCapture.test.ts. */
function capturedTables(): Set<string> {
  const captured = new Set<string>();
  for (const dir of fs.readdirSync(MIGRATIONS).sort()) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
    if (sql.includes('sync_enable_table')) {
      for (const e of sql.matchAll(/sync_enable_table\(\s*'([a-z_]+)'\s*\)/g)) captured.add(e[1]);
      for (const block of sql.matchAll(/ARRAY\s*\[([^\]]*)\]/gi)) {
        for (const lit of block[1].matchAll(/'([a-z_]+)'/g)) captured.add(lit[1]);
      }
    }
    for (const d of sql.matchAll(
      /DROP\s+TRIGGER\s+IF\s+EXISTS\s+zz_sync_capture(?:_del)?\s+ON\s+"?([a-z_]+)"?/gi
    )) captured.delete(d[1]);
  }
  return captured;
}

interface Registration { table: string; column: string; whenUnchanged: boolean }

/**
 * What the migrations put into sync_omitted_columns.
 *
 * Reads the INSERT tuples. A later registration wins, which is how the
 * ON CONFLICT DO UPDATE in 20260923120000 behaves against the database.
 */
function registrations(): Registration[] {
  const byKey = new Map<string, Registration>();

  for (const dir of fs.readdirSync(MIGRATIONS).sort()) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');

    for (const stmt of sql.matchAll(
      /INSERT\s+INTO\s+sync_omitted_columns\s*\(([^)]*)\)\s*VALUES([\s\S]*?);/gi
    )) {
      // Whether this statement supplies when_unchanged at all. The original
      // migration lists only (table_name, column_name), and those rows take
      // the column default of false — "never ship it".
      const hasFlag = /when_unchanged/i.test(stmt[1]);
      for (const tuple of stmt[2].matchAll(/\(([^)]*)\)/g)) {
        const parts = tuple[1].split(',').map((p) => p.trim());
        // Only tuples of quoted literals are VALUES. The trailing
        // `ON CONFLICT (table_name, column_name)` is also a parenthesised
        // pair and would otherwise register a column named "column_name".
        if (!/^'.*'$/.test(parts[0] ?? '') || !/^'.*'$/.test(parts[1] ?? '')) continue;
        const table = parts[0].replace(/^'|'$/g, '');
        const column = parts[1].replace(/^'|'$/g, '');
        if (!table || !column) continue;
        const whenUnchanged = hasFlag && /true/i.test(parts[2] ?? '');
        byKey.set(`${table}.${column}`, { table, column, whenUnchanged });
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Blob columns on a replicated table that are deliberately NOT registered.
 *
 * A name belongs here only when the blob cannot bloat the journal in practice
 * — it is written once with the row and never touched again, so no unrelated
 * edit ever re-ships it. Adding a name is a claim about how the column is
 * WRITTEN, not about how big it is.
 *
 * If you are here because a new column failed the test: registering it is
 * almost always the right answer, and `when_unchanged: true` is almost always
 * the right form.
 */
const ACCEPTED_UNREGISTERED: string[] = [];

describe('blob columns and the sync journal', () => {
  const columns = schemaColumns();
  const captured = capturedTables();
  const regs = registrations();

  it('reads the schema and the migrations at all', () => {
    // Every assertion below passes vacuously on an empty parse, which is the
    // one failure mode a guardrail must not have.
    expect(columns.length).toBeGreaterThan(500);
    expect(columns.some((c) => c.table === 'announcements' && c.column === 'audioData')).toBe(true);
    expect(captured.size).toBeGreaterThan(0);
    expect(regs.length).toBeGreaterThanOrEqual(4);
  });

  it('registers every base64 column on a replicated table', () => {
    // The announcements failure, in test form: a blob on a table whose rows
    // travel, with nothing telling the trigger to hold it back.
    const unregistered = columns
      .filter((c) => c.blob && captured.has(c.table))
      .filter((c) => !regs.some((r) => r.table === c.table && r.column === c.column))
      .map((c) => `${c.table}.${c.column}`)
      .filter((k) => !ACCEPTED_UNREGISTERED.includes(k))
      .sort();

    expect(unregistered).toEqual([]);
  });

  it('never omits a required column unconditionally', () => {
    // The trap in the obvious fix. A NOT NULL column left out of the payload
    // applies as a 23502 on the peer and fails identically on every retry,
    // because no later entry will ever carry the bytes. Such a column may be
    // omitted only when it did not change — the INSERT still carries it.
    const required = new Map(
      columns.filter((c) => !c.nullable).map((c) => [`${c.table}.${c.column}`, c])
    );

    const unsafe = regs
      .filter((r) => !r.whenUnchanged && required.has(`${r.table}.${r.column}`))
      .map((r) => `${r.table}.${r.column}`)
      .sort();

    expect(unsafe).toEqual([]);
  });

  it('does not register a column the schema no longer has', () => {
    // A stale registration silently strips a column that means something else
    // now, or nothing at all.
    const unknown = regs
      .filter((r) => !columns.some((c) => c.table === r.table && c.column === r.column))
      .map((r) => `${r.table}.${r.column}`)
      .sort();

    expect(unknown).toEqual([]);
  });

  it('holds announcements.audioData back on a play, and ships it on a change', () => {
    // The specific regression, asserted by name. This is the row that cost
    // 385 MB and a three-day divergence between the cloud and the theatre.
    const audio = regs.find((r) => r.table === 'announcements' && r.column === 'audioData');
    expect(audio).toBeDefined();
    expect(audio!.whenUnchanged).toBe(true);
  });
});
