// ============================================================
// Who is booking elective cases late, and in which units
// ------------------------------------------------------------
// A pure aggregation over rows fetched elsewhere, so the ranking can be
// tested without a database and so the figure on the screen, the figure in
// the PDF and the figure quoted in a meeting are produced by one piece of
// code.
//
// NAMES ARE REPORTED BECAUSE ACCOUNTABILITY REQUIRES THEM, and for the same
// reason they are reported carefully:
//
//   THE BOOKER IS THE PERSON ANSWERABLE. The ladder in escalation.ts counts
//   against whoever pressed the button, because that is the only person who
//   could have pressed it earlier.
//
//   THE CONSULTANT AND THE TEAM ARE CONTEXT, NOT CULPRITS. A supervising
//   consultant is named so the unit can be told, not because they booked
//   anything. Conflating the two would put a consultant's name on a tally of
//   offences they did not commit, and the report says which is which.
//
//   A MISSING NAME IS SHOWN AS UNRECORDED, never guessed and never silently
//   dropped. A case with no booker recorded is itself a finding.
// ============================================================

import { bookingLateness, formatBookedAt } from '@/lib/bookingLateness';

export interface LateBookingCaseInput {
  id: string;
  scheduledDate: Date | string;
  scheduledTime?: string | null;
  createdAt: Date | string | null;
  surgeryType: string | null;
  unit: string | null;
  subspecialty: string | null;
  procedureName: string | null;
  patientName?: string | null;
  folderNumber?: string | null;
  bookedById: string | null;
  bookedByName: string | null;
  surgeonName: string | null;
  supervisingConsultantId?: string | null;
  supervisingConsultantName?: string | null;
  /** From SurgicalTeamMember, already resolved to names. */
  team?: { role: string; name: string | null }[];
}

export interface LateBookingCase {
  id: string;
  unit: string;
  subspecialty: string;
  procedureName: string;
  patientLabel: string;
  scheduledFor: string;
  bookedAtLabel: string;
  hoursLate: number;
  bookedById: string | null;
  bookedByName: string;
  surgeonName: string;
  consultantName: string;
  seniorRegistrars: string[];
  registrars: string[];
  houseOfficers: string[];
}

export interface OffenderTally {
  personId: string | null;
  name: string;
  count: number;
  /** The units they booked late cases for, usually one. */
  units: string[];
}

export interface UnitReport {
  unit: string;
  lateCount: number;
  /** Elective cases booked by this unit in the window, late or not. */
  electiveTotal: number;
  /** lateCount / electiveTotal, 0–1. Null when the unit booked nothing. */
  lateRate: number | null;
  cases: LateBookingCase[];
  bookers: OffenderTally[];
  consultants: string[];
  seniorRegistrars: string[];
  houseOfficers: string[];
}

export interface LateBookingReport {
  from: string;
  to: string;
  totalElective: number;
  totalLate: number;
  overallRate: number | null;
  /** Units ranked worst first. */
  units: UnitReport[];
  /** Every booker across all units, ranked worst first. */
  offenders: OffenderTally[];
}

const UNRECORDED = 'Not recorded';

const clean = (v: string | null | undefined): string => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : UNRECORDED;
};

/** "12 Oct 2026" plus the slot time when one is known. */
function formatScheduled(date: Date | string, time?: string | null): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return UNRECORDED;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Read as a WAT calendar day, matching bookingLateness.
  const local = new Date(d.getTime() + 60 * 60_000);
  const base = `${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
  return time ? `${base}, ${time}` : base;
}

function namesForRole(team: { role: string; name: string | null }[] | undefined, role: string) {
  const out: string[] = [];
  (team ?? []).forEach((m) => {
    if (m.role !== role) return;
    const n = (m.name ?? '').trim();
    if (n && !out.includes(n)) out.push(n);
  });
  return out;
}

/** Sort worst first, then alphabetically so equal rows have a stable order. */
function byCountThenName<T extends { count: number; name: string }>(a: T, b: T) {
  return b.count - a.count || a.name.localeCompare(b.name);
}

export function buildLateBookingReport(
  rows: LateBookingCaseInput[],
  window: { from: string; to: string },
): LateBookingReport {
  const electiveByUnit = new Map<string, number>();
  const lateCases: LateBookingCase[] = [];

  let totalElective = 0;

  rows.forEach((r) => {
    const type = (r.surgeryType ?? 'ELECTIVE').toUpperCase();
    const unit = clean(r.unit);

    // The denominator is elective cases only. Including emergencies would
    // flatter a unit that does a lot of them and make the rate meaningless.
    if (type === 'ELECTIVE') {
      totalElective += 1;
      electiveByUnit.set(unit, (electiveByUnit.get(unit) ?? 0) + 1);
    }

    const verdict = bookingLateness({
      scheduledDate: r.scheduledDate,
      bookedAt: r.createdAt,
      surgeryType: r.surgeryType,
    });
    if (!verdict.isLate) return;

    lateCases.push({
      id: r.id,
      unit,
      subspecialty: clean(r.subspecialty),
      procedureName: clean(r.procedureName),
      patientLabel: r.folderNumber
        ? `${clean(r.patientName)} (${r.folderNumber})`
        : clean(r.patientName),
      scheduledFor: formatScheduled(r.scheduledDate, r.scheduledTime),
      bookedAtLabel: formatBookedAt(r.createdAt),
      hoursLate: Math.round((verdict.hoursLate ?? 0) * 10) / 10,
      bookedById: r.bookedById ?? null,
      bookedByName: clean(r.bookedByName),
      surgeonName: clean(r.surgeonName),
      consultantName: clean(r.supervisingConsultantName),
      seniorRegistrars: namesForRole(r.team, 'SENIOR_REGISTRAR'),
      registrars: namesForRole(r.team, 'REGISTRAR'),
      houseOfficers: namesForRole(r.team, 'HOUSE_OFFICER'),
    });
  });

  // ── Per unit ──────────────────────────────────────────────────────────
  const unitNames: string[] = [];
  const casesByUnit = new Map<string, LateBookingCase[]>();
  lateCases.forEach((c) => {
    if (!casesByUnit.has(c.unit)) {
      casesByUnit.set(c.unit, []);
      unitNames.push(c.unit);
    }
    casesByUnit.get(c.unit)!.push(c);
  });

  const units: UnitReport[] = unitNames.map((unit) => {
    const cases = casesByUnit.get(unit)!;

    const bookerMap = new Map<string, OffenderTally>();
    const consultants: string[] = [];
    const seniorRegistrars: string[] = [];
    const houseOfficers: string[] = [];

    cases.forEach((c) => {
      // Keyed on id where there is one, so two people with the same name are
      // two tallies and one person renamed is still one.
      const key = c.bookedById ?? `name:${c.bookedByName}`;
      const existing = bookerMap.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.units.includes(unit)) existing.units.push(unit);
      } else {
        bookerMap.set(key, {
          personId: c.bookedById,
          name: c.bookedByName,
          count: 1,
          units: [unit],
        });
      }

      if (c.consultantName !== UNRECORDED && !consultants.includes(c.consultantName)) {
        consultants.push(c.consultantName);
      }
      c.seniorRegistrars.forEach((n) => {
        if (!seniorRegistrars.includes(n)) seniorRegistrars.push(n);
      });
      c.houseOfficers.forEach((n) => {
        if (!houseOfficers.includes(n)) houseOfficers.push(n);
      });
    });

    const bookers: OffenderTally[] = [];
    bookerMap.forEach((v) => bookers.push(v));
    bookers.sort(byCountThenName);

    const electiveTotal = electiveByUnit.get(unit) ?? cases.length;

    return {
      unit,
      lateCount: cases.length,
      electiveTotal,
      lateRate: electiveTotal > 0 ? cases.length / electiveTotal : null,
      // Worst offence first within the unit, so the page opens on the worst.
      cases: cases.slice().sort((a, b) => b.hoursLate - a.hoursLate),
      bookers,
      consultants: consultants.sort(),
      seniorRegistrars: seniorRegistrars.sort(),
      houseOfficers: houseOfficers.sort(),
    };
  });

  // RANKED BY COUNT, NOT BY RATE. The question asked was which units offend
  // most, and a small unit with two late cases out of three is not a bigger
  // problem for the theatre than a large one with twenty. The rate is
  // reported beside it so a busy unit is not condemned by volume alone.
  units.sort((a, b) => b.lateCount - a.lateCount || a.unit.localeCompare(b.unit));

  // ── Across all units ──────────────────────────────────────────────────
  const allMap = new Map<string, OffenderTally>();
  lateCases.forEach((c) => {
    const key = c.bookedById ?? `name:${c.bookedByName}`;
    const existing = allMap.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.units.includes(c.unit)) existing.units.push(c.unit);
    } else {
      allMap.set(key, { personId: c.bookedById, name: c.bookedByName, count: 1, units: [c.unit] });
    }
  });
  const offenders: OffenderTally[] = [];
  allMap.forEach((v) => offenders.push(v));
  offenders.sort(byCountThenName);

  return {
    from: window.from,
    to: window.to,
    totalElective,
    totalLate: lateCases.length,
    overallRate: totalElective > 0 ? lateCases.length / totalElective : null,
    units,
    offenders,
  };
}

/** "37%" — one place is false precision on counts this small. */
export function formatRate(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}
