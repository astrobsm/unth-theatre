/**
 * WHERE ARE THIS UNIT'S CASES?
 *
 *     npx tsx scripts/where-are-the-cases.ts                 # every unit, 30 days
 *     npx tsx scripts/where-are-the-cases.ts Orthopaedics    # one unit or subspecialty
 *     npx tsx scripts/where-are-the-cases.ts Orthopaedics 90 # and a wider window
 *
 * Read only. There is no --apply and there is no write path.
 *
 * WHY IT EXISTS. "I cannot see the booking" has four ordinary causes and they
 * are indistinguishable from the screen:
 *
 *   1. the case is on a DIFFERENT DATE, and the list defaults to today;
 *   2. the unit card is on the page but has not been opened;
 *   3. the case was booked under a unit spelled differently, so it sits under
 *      a card nobody recognises;
 *   4. the case was booked with an EMPTY unit, so it sits under
 *      "Unassigned unit" -- which is the one people never think to open.
 *
 * This prints the counts by unit and by date so that the answer is a fact
 * rather than a guess, and so the person on the ward can be told which of the
 * four it was.
 *
 * WHICH DATABASE. Resolved through scripts/lib/nodeDatabase.js, the same
 * module `npm run build` migrates with, and printed before anything is read.
 */

export {};

const {
  describe: describeCaseDb,
  resolveNodeDatabase: resolveCaseDb,
} = require('./lib/nodeDatabase');

interface Row {
  unit: string | null;
  subspecialty: string | null;
  day: string;
  cases: bigint | number;
}

async function reportCases(): Promise<void> {
  const wanted = (process.argv[2] ?? '').trim();
  const days = Number.parseInt(process.argv[3] ?? '30', 10) || 30;

  const resolved = resolveCaseDb();
  process.env.DATABASE_URL = resolved.url;
  console.log(`Database: ${describeCaseDb(resolved)}`);
  console.log(`Window:   the last ${days} days and the next ${days}`);
  if (wanted) console.log(`Filter:   unit or subspecialty containing "${wanted}"`);
  console.log('');

  const { default: prisma } = await import('../src/lib/prisma');

  try {
    // Grouped in SQL rather than pulled and counted here: the point is to be
    // runnable on a theatre server against a live table without dragging
    // every case across the wire.
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `select
         coalesce(nullif(btrim("unit"), ''), '(no unit)') as unit,
         coalesce(nullif(btrim("subspecialty"), ''), '(none)') as subspecialty,
         to_char("scheduledDate", 'YYYY-MM-DD') as day,
         count(*) as cases
       from surgeries
       where "scheduledDate" between now() - ($1 || ' days')::interval
                                 and now() + ($1 || ' days')::interval
         and ($2 = ''
              or "unit" ilike '%' || $2 || '%'
              or "subspecialty" ilike '%' || $2 || '%')
       group by 1, 2, 3
       order by 3 desc, 1`,
      String(days),
      wanted,
    );

    if (rows.length === 0) {
      console.log('No cases at all in that window for that filter.');
      console.log('');
      console.log('That means the booking is either outside the window, or it was never');
      console.log('created. Widen the window, or drop the filter to see every unit.');
      return;
    }

    const byUnit = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const n = Number(r.cases);
      const key = `${r.unit}  ·  ${r.subspecialty}`;
      byUnit.set(key, (byUnit.get(key) ?? 0) + n);
      byDay.set(r.day, (byDay.get(r.day) ?? 0) + n);
    }

    console.log('BY UNIT (what the unit cards will show)');
    for (const [unit, n] of [...byUnit.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${unit}`);
    }

    console.log('');
    console.log('BY DATE (the list opens on today, and shows only that date)');
    const today = new Date().toISOString().slice(0, 10);
    for (const [day, n] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
      const mark = day === today ? '  <-- today' : '';
      console.log(`  ${day}   ${String(n).padStart(4)} case(s)${mark}`);
    }

    const unassigned = [...byUnit.entries()].filter(([k]) => k.startsWith('(no unit)'));
    if (unassigned.length) {
      console.log('');
      console.log('NOTE: some cases have no unit. On the screen they are grouped under');
      console.log('"Unassigned unit", which is the card people do not think to open.');
    }
  } finally {
    await prisma.$disconnect().catch(() => { /* closing is best effort */ });
  }
}

reportCases().catch((err) => {
  console.error(err);
  process.exit(1);
});
