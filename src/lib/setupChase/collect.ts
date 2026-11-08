// ============================================================
// Which theatres were operating, who was on them, and what they did not log
// ------------------------------------------------------------
// "ALL ELECTIVE DAYS" IS READ FROM THE WORK, NOT FROM THE CALENDAR. Monday-to-
// Friday is the obvious implementation and it is wrong in both directions: it
// chases somebody about a public holiday, and it says nothing about the
// Saturday lists that do run. A theatre has an elective day when there is
// evidence of an elective list in it — an allocation for the day, or a booked
// elective case naming the theatre. A theatre with no list that day is not
// asked about, because there was nothing to set up.
//
// THE UNIT IS A THEATRE-DAY, NOT A DAY. Fifteen rooms run on a Tuesday and
// each has its own technician, its own machine and its own checklist. Judging
// "Tuesday" as a whole would tell a technician who set up Theatre 3 at 08:05
// that the morning was late because nobody logged Theatre 9.
//
// WHO IS ASKED, IN THIS ORDER:
//
//   1. The technician on the setup log, where there is one. They did the work;
//      the lateness and the unticked boxes are theirs, whatever the roster
//      said. Where the log also records that they were assigned elsewhere,
//      that is carried through so a theatre swap reads as a swap.
//   2. The technician named on the day's allocation for that theatre.
//   3. The technician named on an elective case in that theatre.
//   4. Nobody — which is REPORTED, not hidden. A theatre that operated with no
//      technician assigned anywhere is a worse finding than a late setup, and
//      no message can fix it: it needs somebody allocated.
//
// GROUPED BY TECHNICIAN, so one person gets one message about all their
// theatre-days rather than four messages about four rooms. That is the
// grouping case-chase already uses for a surgeon, for the same reason.
// ============================================================

import prisma from '@/lib/prisma';
import { watDay, watDayRange, watClock, dateColumn } from '@/lib/watDay';
import {
  setupGaps, certifiedAt, uncheckedItems, EQUIPMENT_CHECKS, SETUP_GAP_CODES,
  type SetupGapCode, type SetupLogFacts, type TheatreDayForGaps, type EquipmentField,
} from './gaps';

export type TechnicianSource = 'SETUP_LOG' | 'ALLOCATION' | 'CASE' | 'NONE';

export interface SetupTheatreDay {
  day: string;
  theatreId: string;
  theatreName: string;
  /** Why this counts as an elective day for this theatre. */
  evidence: 'ALLOCATION' | 'CASE';
  /** How many elective cases were listed in it. */
  caseCount: number;
  gaps: SetupGapCode[];
  /** WAT wall clock the theatre was certified at, where it was. */
  certifiedClock: string | null;
  /** WAT wall clock the end-of-day check was entered at, where it was. */
  endOfDayClock: string | null;
  /** Checklist items left unticked on a theatre certified ready. */
  unchecked: string[];
  /** The theatre was checked, found wanting and stood down. Not a failure. */
  stoodDown: boolean;
  technicianId: string | null;
  technicianName: string | null;
  technicianSource: TechnicianSource;
  /** Where the log says this technician was actually assigned elsewhere. */
  assignedTheatreName: string | null;
}

export interface SetupTechnicianGroup {
  personId: string;
  personName: string;
  theatreDays: SetupTheatreDay[];
  counts: Record<string, number>;
  /** The distinct theatres involved, for a heading. */
  theatres: string[];
}

const key = (day: string, theatreId: string) => `${day}|${theatreId}`;

/**
 * Every elective theatre-day in the window with something outstanding.
 *
 * `now` is a parameter so the deadlines can be proved rather than read: a test
 * can stand at 08:29 and at 08:31 on the same data.
 */
export async function collectSetupGaps(
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<{ theatreDays: SetupTheatreDay[]; electiveTheatreDays: number }> {
  const start = watDayRange(from).start;
  const end = watDayRange(to).end;

  // ── Which theatres had an elective list, and who was on them ────
  const [allocations, cases] = await Promise.all([
    prisma.theatreAllocation.findMany({
      where: {
        date: { gte: start, lt: end },
        // SURGERY only. MAINTENANCE is a theatre deliberately closed and
        // EMERGENCY is not an elective day -- but RESERVED is left out too,
        // deliberately: a room held in reserve and never opened is not a
        // theatre somebody failed to set up, and this board sends messages
        // about people's work. Where a reserved theatre DID operate, the
        // elective case naming it brings the day in by the other route, so
        // nothing real is lost by being conservative here.
        allocationType: 'SURGERY' as never,
        OR: [{ surgeryType: 'ELECTIVE' as never }, { surgeryType: null }],
      },
      select: {
        date: true, theatreId: true, anaestheticTechnicianId: true,
        theatre: { select: { name: true, isOperatingRoom: true } },
      },
    }),
    prisma.surgery.findMany({
      where: {
        surgeryType: 'ELECTIVE' as never,
        status: { not: 'CANCELLED' as never },
        scheduledDate: { gte: start, lt: end },
        theatreId: { not: null },
      },
      select: { scheduledDate: true, theatreId: true, theatreTechnicianId: true },
    }),
  ]);

  interface Cell {
    day: string;
    theatreId: string;
    theatreName: string;
    evidence: 'ALLOCATION' | 'CASE';
    caseCount: number;
    allocationTechnicianId: string | null;
    caseTechnicianId: string | null;
  }
  const cells = new Map<string, Cell>();

  allocations.forEach((a) => {
    // The holding area and the recovery room sit in this table as suites. They
    // are not set up by an anaesthetic technician and must not be asked about.
    if (a.theatre && a.theatre.isOperatingRoom === false) return;
    const day = watDay(a.date);
    const k = key(day, a.theatreId);
    const had = cells.get(k);
    if (had) {
      had.allocationTechnicianId = had.allocationTechnicianId ?? a.anaestheticTechnicianId ?? null;
      return;
    }
    cells.set(k, {
      day,
      theatreId: a.theatreId,
      theatreName: a.theatre?.name ?? 'Theatre',
      evidence: 'ALLOCATION',
      caseCount: 0,
      allocationTechnicianId: a.anaestheticTechnicianId ?? null,
      caseTechnicianId: null,
    });
  });

  cases.forEach((c) => {
    if (!c.theatreId) return;
    const day = watDay(c.scheduledDate);
    const k = key(day, c.theatreId);
    const had = cells.get(k);
    if (had) {
      had.caseCount += 1;
      had.caseTechnicianId = had.caseTechnicianId ?? c.theatreTechnicianId ?? null;
      return;
    }
    cells.set(k, {
      day,
      theatreId: c.theatreId,
      theatreName: '',
      evidence: 'CASE',
      caseCount: 1,
      allocationTechnicianId: null,
      caseTechnicianId: c.theatreTechnicianId ?? null,
    });
  });

  if (cells.size === 0) return { theatreDays: [], electiveTheatreDays: 0 };

  // Theatre names, and the operating-room filter, for cells that came from a
  // case rather than from an allocation.
  const theatreIds = Array.from(new Set(Array.from(cells.values()).map((c) => c.theatreId)));
  const suites = await prisma.theatreSuite.findMany({
    where: { id: { in: theatreIds } },
    select: { id: true, name: true, isOperatingRoom: true },
  });
  const suiteById = new Map(suites.map((s) => [s.id, s]));
  Array.from(cells.entries()).forEach(([k, cell]) => {
    const suite = suiteById.get(cell.theatreId);
    // A theatre id that no longer resolves is dropped rather than reported
    // against a blank name: nobody can act on "Theatre ''".
    if (!suite || suite.isOperatingRoom === false) { cells.delete(k); return; }
    if (!cell.theatreName) cell.theatreName = suite.name;
  });

  // ── The logs ────────────────────────────────────────────────────
  // setupDate is a Prisma @db.Date, so the bounds are midnight UTC of the two
  // days -- NOT watDayRange, which returns the instant a WAT day begins and is
  // 23:00 on the day before. Built from watDayRange, `lte` landed a day early
  // and the last day of every window found no logs at all: the board then
  // reported, with complete confidence, that nobody had set up any theatre
  // yesterday. dateColumn exists so that cannot be got wrong again.
  const dayStart = dateColumn(from);
  const dayEnd = dateColumn(to);
  const logRows = await prisma.anesthesiaSetupLog.findMany({
    where: { setupDate: { gte: dayStart!, lte: dayEnd! }, theatreId: { in: theatreIds } },
    select: {
      id: true, setupDate: true, theatreId: true,
      technicianId: true, technicianName: true,
      assignedTheatreName: true,
      setupStartTime: true, setupEndTime: true, readyTime: true, isReady: true,
      endOfDayLogged: true, endOfDayTime: true, deficiencyReportedAt: true,
      gasSupplyChecked: true, suctionChecked: true, monitorsChecked: true,
      ventilatorChecked: true, anesthesiaMachineChecked: true,
      emergencyDrugsChecked: true, airwayEquipmentChecked: true, ivEquipmentChecked: true,
    },
    orderBy: { setupStartTime: 'asc' },
  });

  type LogRow = typeof logRows[number];
  const logByCell = new Map<string, LogRow>();
  logRows.forEach((l) => {
    const k = key(watDay(l.setupDate), l.theatreId);
    // The EARLIEST log for a theatre-day wins. A theatre set up at 08:10 and
    // logged again at 11:00 for the afternoon session was set up on time, and
    // reading the later row would report it as three hours late.
    if (!logByCell.has(k)) logByCell.set(k, l);
  });

  const toFacts = (l: LogRow): SetupLogFacts => {
    const checks: Partial<Record<EquipmentField, boolean>> = {};
    EQUIPMENT_CHECKS.forEach((c) => {
      checks[c.field] = (l as unknown as Record<string, boolean>)[c.field] === true;
    });
    return {
      id: l.id,
      technicianId: l.technicianId ?? null,
      technicianName: l.technicianName ?? null,
      readyTime: l.readyTime ?? null,
      setupStartTime: l.setupStartTime ?? null,
      setupEndTime: l.setupEndTime ?? null,
      isReady: l.isReady,
      endOfDayLogged: l.endOfDayLogged,
      endOfDayTime: l.endOfDayTime ?? null,
      deficiencyReportedAt: l.deficiencyReportedAt ?? null,
      checks,
    };
  };

  // ── Judge each theatre-day, and name who answers for it ─────────
  const out: SetupTheatreDay[] = [];
  const electiveTheatreDays = cells.size;

  const nameIds = new Set<string>();
  cells.forEach((cell) => {
    if (cell.allocationTechnicianId) nameIds.add(cell.allocationTechnicianId);
    if (cell.caseTechnicianId) nameIds.add(cell.caseTechnicianId);
  });
  logByCell.forEach((l) => { if (l.technicianId) nameIds.add(l.technicianId); });
  const people = nameIds.size
    ? await prisma.user.findMany({
      where: { id: { in: Array.from(nameIds) } },
      select: { id: true, fullName: true },
    })
    : [];
  const nameOf = new Map(people.map((p) => [p.id, p.fullName]));

  cells.forEach((cell, k) => {
    const logRow = logByCell.get(k) ?? null;
    const log = logRow ? toFacts(logRow) : null;
    const td: TheatreDayForGaps = {
      day: cell.day,
      theatreId: cell.theatreId,
      theatreName: cell.theatreName,
      log,
    };
    const gaps = setupGaps(td, now);
    if (gaps.length === 0) return;

    // See the header for the order, and why the log wins.
    let technicianId: string | null = null;
    let source: TechnicianSource = 'NONE';
    if (log?.technicianId) { technicianId = log.technicianId; source = 'SETUP_LOG'; }
    else if (cell.allocationTechnicianId) {
      technicianId = cell.allocationTechnicianId; source = 'ALLOCATION';
    } else if (cell.caseTechnicianId) {
      technicianId = cell.caseTechnicianId; source = 'CASE';
    }

    const certified = log ? certifiedAt(log) : null;
    out.push({
      day: cell.day,
      theatreId: cell.theatreId,
      theatreName: cell.theatreName,
      evidence: cell.evidence,
      caseCount: cell.caseCount,
      gaps,
      certifiedClock: certified ? watClock(certified) : null,
      endOfDayClock: log?.endOfDayTime ? watClock(log.endOfDayTime) : null,
      unchecked: log && log.isReady ? uncheckedItems(log) : [],
      stoodDown: Boolean(log?.deficiencyReportedAt),
      technicianId,
      technicianName: technicianId
        ? (nameOf.get(technicianId) ?? log?.technicianName ?? null)
        : null,
      technicianSource: source,
      // Only where the log says they were assigned somewhere else: a swap is a
      // different conversation from a theatre nobody touched.
      assignedTheatreName: logRow?.assignedTheatreName ?? null,
    });
  });

  out.sort((a, b) => (a.day === b.day
    ? a.theatreName.localeCompare(b.theatreName)
    : a.day.localeCompare(b.day)));

  return { theatreDays: out, electiveTheatreDays };
}

/** One message per technician, about all their theatre-days. */
export function groupByTechnician(
  theatreDays: readonly SetupTheatreDay[],
): SetupTechnicianGroup[] {
  const groups = new Map<string, SetupTechnicianGroup>();
  theatreDays.forEach((td) => {
    if (!td.technicianId) return;
    let g = groups.get(td.technicianId);
    if (!g) {
      g = {
        personId: td.technicianId,
        personName: td.technicianName ?? 'Technician',
        theatreDays: [],
        counts: Object.fromEntries(SETUP_GAP_CODES.map((c) => [c, 0])),
        theatres: [],
      };
      groups.set(td.technicianId, g);
    }
    g.theatreDays.push(td);
    td.gaps.forEach((code) => { g!.counts[code] = (g!.counts[code] ?? 0) + 1; });
    if (g.theatres.indexOf(td.theatreName) === -1) g.theatres.push(td.theatreName);
  });
  return Array.from(groups.values())
    .sort((a, b) => b.theatreDays.length - a.theatreDays.length);
}

/**
 * Theatre-days with nobody to write to.
 *
 * Reported, never hidden. A theatre that operated with no technician named on
 * the allocation, on any case, or on a setup log is a hole in the allocation,
 * and the only fix is for somebody to be assigned.
 */
export const unassigned = (
  theatreDays: readonly SetupTheatreDay[],
): SetupTheatreDay[] => theatreDays.filter((td) => !td.technicianId);
