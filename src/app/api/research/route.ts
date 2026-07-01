import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { describe, welchTTest, mannWhitneyU, chiSquare, pearson } from '@/lib/stats';

export const dynamic = 'force-dynamic';

// ---- Types -----------------------------------------------------------------

interface CaseRow {
  id: string;
  date: Date | null;
  status: string;
  type: string;
  subspecialty: string;
  unit: string;
  location: string;
  surgeonId: string | null;
  surgeonName: string;
  anaesthetistId: string | null;
  anaesthetistName: string;
  anaesthesiaType: string | null;
  age: number | null;
  gender: string;
  ward: string;
  paediatric: boolean;
  durationMinutes: number | null;
  bloodLoss: number | null;
  complexityScore: number | null;
  complexityClass: string | null;
  cancelled: boolean;
  cancellationCategory: string | null;
  cancellationReason: string | null;
}

// ---- Helpers ---------------------------------------------------------------

function minutesBetween(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

function surgeryDuration(s: any): number | null {
  return (
    minutesBetween(s.intraOperativeRecord?.knifeToSkinTime, s.intraOperativeRecord?.procedureEndTime) ??
    minutesBetween(s.knifeOnSkinTime, s.surgeryEndTime) ??
    minutesBetween(s.actualStartTime, s.actualEndTime) ??
    (typeof s.estimatedDuration === 'number' ? s.estimatedDuration : null)
  );
}

function toRow(s: any): CaseRow {
  const age = s.patient?.age ?? null;
  return {
    id: s.id,
    date: s.scheduledDate ?? s.createdAt ?? null,
    status: s.status,
    type: s.surgeryType,
    subspecialty: s.subspecialty || 'Unspecified',
    unit: s.unit || 'Unspecified',
    location: s.location || 'Unspecified',
    surgeonId: s.surgeonId ?? null,
    surgeonName: s.surgeonName || s.surgeon?.fullName || 'Unknown',
    anaesthetistId: s.anesthetistId ?? null,
    anaesthetistName: s.anesthetist?.fullName || 'Unknown',
    anaesthesiaType: s.anesthesiaType ?? null,
    age,
    gender: s.patient?.gender || 'Unknown',
    ward: s.patient?.ward || 'Unknown',
    paediatric: typeof age === 'number' ? age < 16 : false,
    durationMinutes: surgeryDuration(s),
    bloodLoss: s.intraOperativeRecord?.estimatedBloodLoss ?? null,
    complexityScore: s.complexityScore ?? null,
    complexityClass: s.complexityClass ?? null,
    cancelled: s.status === 'CANCELLED',
    cancellationCategory: s.cancellation?.category ?? null,
    cancellationReason: s.cancellation?.reason ?? null,
  };
}

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// ISO week key (YYYY-Www) for weekly trends.
function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function fetchSurgeries(where: any) {
  return prisma.surgery.findMany({
    where,
    include: {
      patient: { select: { age: true, gender: true, ward: true } },
      surgeon: { select: { fullName: true } },
      anesthetist: { select: { fullName: true } },
      cancellation: { select: { category: true, reason: true, cancelledAt: true } },
      intraOperativeRecord: {
        select: {
          estimatedBloodLoss: true,
          knifeToSkinTime: true,
          procedureEndTime: true,
        },
      },
    },
    orderBy: { scheduledDate: 'asc' },
  });
}

// Build a Prisma where-clause from the shared filter query params.
function buildWhere(params: URLSearchParams): any {
  const where: any = {};
  const start = params.get('startDate');
  const end = params.get('endDate');
  if (start || end) {
    where.scheduledDate = {};
    if (start) where.scheduledDate.gte = new Date(start);
    if (end) {
      const e = new Date(end);
      e.setHours(23, 59, 59, 999);
      where.scheduledDate.lte = e;
    }
  }
  const specialty = params.get('specialty');
  if (specialty) where.subspecialty = specialty;
  const unit = params.get('unit');
  if (unit) where.unit = unit;
  const location = params.get('theatre');
  if (location) where.location = location;
  const surgeonId = params.get('surgeonId');
  if (surgeonId) where.surgeonId = surgeonId;
  const anaesthetistId = params.get('anaesthetistId');
  if (anaesthetistId) where.anesthetistId = anaesthetistId;
  const type = params.get('type');
  if (type) where.surgeryType = type;
  const status = params.get('status');
  if (status) where.status = status;
  return where;
}

// Post-fetch row filters that Prisma can't express directly (age group).
function applyRowFilters(rows: CaseRow[], params: URLSearchParams): CaseRow[] {
  let out = rows;
  const ageGroup = params.get('ageGroup');
  if (ageGroup === 'adult') out = out.filter((r) => (r.age ?? 99) >= 16);
  if (ageGroup === 'paediatric') out = out.filter((r) => (r.age ?? 99) < 16);
  return out;
}

// ---- GET: dashboard aggregation -------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);

    // Distinct filter option lists are cheap and drive the dashboard selectors.
    if (searchParams.get('meta') === '1') {
      const [specialties, units, locations, surgeons, anaesthetists] = await Promise.all([
        prisma.surgery.findMany({ distinct: ['subspecialty'], select: { subspecialty: true }, orderBy: { subspecialty: 'asc' } }),
        prisma.surgery.findMany({ distinct: ['unit'], select: { unit: true }, orderBy: { unit: 'asc' } }),
        prisma.surgery.findMany({ distinct: ['location'], select: { location: true }, orderBy: { location: 'asc' } }),
        prisma.user.findMany({ where: { role: 'SURGEON' }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
        prisma.user.findMany({ where: { role: { in: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'] } }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      ]);
      return NextResponse.json({
        specialties: specialties.map((s) => s.subspecialty).filter(Boolean),
        units: units.map((u) => u.unit).filter(Boolean),
        theatres: locations.map((l) => l.location).filter(Boolean),
        surgeons,
        anaesthetists,
      });
    }

    const where = buildWhere(searchParams);
    const surgeries = await fetchSurgeries(where);
    const allRows = surgeries.map(toRow);
    const rows = applyRowFilters(allRows, searchParams);

    const total = rows.length;
    const completed = rows.filter((r) => r.status === 'COMPLETED').length;
    const cancelled = rows.filter((r) => r.cancelled).length;
    const inProgress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
    const scheduled = rows.filter((r) => r.status === 'SCHEDULED').length;
    const elective = rows.filter((r) => r.type === 'ELECTIVE').length;
    const emergency = rows.filter((r) => r.type === 'EMERGENCY').length;
    const urgent = rows.filter((r) => r.type === 'URGENT').length;

    // Daily & monthly trends.
    const dailyCounts = countBy(rows, (r) => (r.date ? new Date(r.date).toISOString().slice(0, 10) : null));
    const monthlyCounts = countBy(rows, (r) => (r.date ? new Date(r.date).toISOString().slice(0, 7) : null));
    const weeklyCounts = countBy(rows, (r) => (r.date ? weekKey(new Date(r.date)) : null));

    const distinctDays = Object.keys(dailyCounts).length || 1;

    // Descriptive stats on durations, blood loss and complexity.
    const durationStats = describe(rows.map((r) => r.durationMinutes));
    const bloodLossStats = describe(rows.map((r) => r.bloodLoss));
    const complexityStats = describe(rows.map((r) => r.complexityScore));

    // Surgeon performance table.
    const surgeonMap = new Map<string, CaseRow[]>();
    for (const r of rows) {
      const key = r.surgeonName;
      if (!surgeonMap.has(key)) surgeonMap.set(key, []);
      surgeonMap.get(key)!.push(r);
    }
    const surgeonPerformance = Array.from(surgeonMap.entries())
      .map(([name, list]) => {
        const dur = describe(list.map((r) => r.durationMinutes));
        const bl = describe(list.map((r) => r.bloodLoss));
        const cx = describe(list.map((r) => r.complexityScore));
        const canc = list.filter((r) => r.cancelled).length;
        return {
          surgeon: name,
          cases: list.length,
          avgDuration: dur.mean,
          avgBloodLoss: bl.mean,
          avgComplexity: cx.mean,
          cancellationRate: list.length ? (canc / list.length) * 100 : 0,
          emergencyRatio: list.length ? (list.filter((r) => r.type === 'EMERGENCY').length / list.length) * 100 : 0,
        };
      })
      .sort((a, b) => b.cases - a.cases);

    // OR / theatre utilization.
    const theatreMap = new Map<string, CaseRow[]>();
    for (const r of rows) {
      const key = r.location;
      if (!theatreMap.has(key)) theatreMap.set(key, []);
      theatreMap.get(key)!.push(r);
    }
    const orUtilization = Array.from(theatreMap.entries())
      .map(([theatre, list]) => {
        const totalMinutes = list.reduce((a, r) => a + (r.durationMinutes || 0), 0);
        return {
          theatre,
          cases: list.length,
          operatingHours: Math.round((totalMinutes / 60) * 10) / 10,
          avgCaseMinutes: list.length ? Math.round(totalMinutes / list.length) : 0,
        };
      })
      .sort((a, b) => b.cases - a.cases);

    // Anaesthesia mix.
    const anaesthesiaMix = countBy(rows, (r) => r.anaesthesiaType || 'Unspecified');

    // Specialty breakdown.
    const bySpecialty = countBy(rows, (r) => r.subspecialty);

    // Complexity distribution.
    const complexityDistribution = countBy(rows, (r) => r.complexityClass);

    // Cancellation analysis.
    const cancelledRows = rows.filter((r) => r.cancelled);
    const cancellationByCategory = countBy(cancelledRows, (r) => r.cancellationCategory || 'OTHER');
    const cancellationByReason = countBy(cancelledRows, (r) => r.cancellationReason || 'Unspecified');

    return NextResponse.json({
      filters: Object.fromEntries(searchParams.entries()),
      volume: {
        total,
        completed,
        cancelled,
        inProgress,
        scheduled,
        elective,
        emergency,
        urgent,
        avgPerDay: Math.round((total / distinctDays) * 10) / 10,
        cancellationRate: total ? Math.round((cancelled / total) * 1000) / 10 : 0,
      },
      trends: {
        daily: dailyCounts,
        weekly: weeklyCounts,
        monthly: monthlyCounts,
      },
      bySpecialty,
      anaesthesiaMix,
      surgeonPerformance,
      orUtilization,
      complexityDistribution,
      cancellation: {
        byCategory: cancellationByCategory,
        byReason: cancellationByReason,
      },
      durationStats,
      bloodLossStats,
      complexityStats,
    });
  } catch (error) {
    console.error('Research analytics error:', error);
    return NextResponse.json({ error: 'Failed to generate analytics' }, { status: 500 });
  }
}

// ---- POST: research query builder (anonymized dataset + statistics) --------

// Field accessor map for the query builder.
const NUMERIC_FIELDS: Record<string, (r: CaseRow) => number | null> = {
  age: (r) => r.age,
  durationMinutes: (r) => r.durationMinutes,
  bloodLoss: (r) => r.bloodLoss,
  complexityScore: (r) => r.complexityScore,
};

const CATEGORICAL_FIELDS: Record<string, (r: CaseRow) => string | null> = {
  status: (r) => r.status,
  type: (r) => r.type,
  subspecialty: (r) => r.subspecialty,
  unit: (r) => r.unit,
  theatre: (r) => r.location,
  gender: (r) => r.gender,
  anaesthesiaType: (r) => r.anaesthesiaType,
  complexityClass: (r) => r.complexityClass,
  cancellationCategory: (r) => r.cancellationCategory,
};

interface Criterion {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: string | number | string[];
}

function matchesCriterion(r: CaseRow, c: Criterion): boolean {
  if (NUMERIC_FIELDS[c.field]) {
    const v = NUMERIC_FIELDS[c.field](r);
    if (v == null) return false;
    const target = Number(c.value);
    switch (c.op) {
      case 'eq': return v === target;
      case 'neq': return v !== target;
      case 'gt': return v > target;
      case 'gte': return v >= target;
      case 'lt': return v < target;
      case 'lte': return v <= target;
      default: return false;
    }
  }
  if (CATEGORICAL_FIELDS[c.field]) {
    const v = CATEGORICAL_FIELDS[c.field](r);
    if (v == null) return false;
    if (c.op === 'in' && Array.isArray(c.value)) return c.value.includes(v);
    if (c.op === 'eq') return v === c.value;
    if (c.op === 'neq') return v !== c.value;
    return false;
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const startDate: string | undefined = body.startDate;
    const endDate: string | undefined = body.endDate;
    const include: Criterion[] = Array.isArray(body.include) ? body.include : [];
    const exclude: Criterion[] = Array.isArray(body.exclude) ? body.exclude : [];

    const where: any = {};
    if (startDate || endDate) {
      where.scheduledDate = {};
      if (startDate) where.scheduledDate.gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.scheduledDate.lte = e;
      }
    }

    const surgeries = await fetchSurgeries(where);
    let rows = surgeries.map(toRow);

    // Apply inclusion (all must match) and exclusion (none must match) criteria.
    if (include.length > 0) {
      rows = rows.filter((r) => include.every((c) => matchesCriterion(r, c)));
    }
    if (exclude.length > 0) {
      rows = rows.filter((r) => !exclude.some((c) => matchesCriterion(r, c)));
    }

    // Anonymized dataset — strip any direct identifiers. Surgeon/anaesthetist
    // names are hashed to opaque codes so cohorts stay comparable but private.
    const codeCache = new Map<string, string>();
    let counter = 0;
    const codeFor = (prefix: string, name: string) => {
      const key = `${prefix}:${name}`;
      if (!codeCache.has(key)) {
        counter += 1;
        codeCache.set(key, `${prefix}${String(counter).padStart(3, '0')}`);
      }
      return codeCache.get(key)!;
    };
    const anonymized = rows.map((r, i) => ({
      caseId: `C${String(i + 1).padStart(4, '0')}`,
      month: r.date ? new Date(r.date).toISOString().slice(0, 7) : null,
      status: r.status,
      type: r.type,
      specialty: r.subspecialty,
      unit: r.unit,
      theatre: r.location,
      surgeonCode: codeFor('S', r.surgeonName),
      anaesthetistCode: codeFor('A', r.anaesthetistName),
      anaesthesiaType: r.anaesthesiaType,
      ageBand: r.age == null ? null : r.age < 16 ? '<16' : r.age < 40 ? '16-39' : r.age < 60 ? '40-59' : '60+',
      gender: r.gender,
      durationMinutes: r.durationMinutes,
      bloodLossMl: r.bloodLoss,
      complexityScore: r.complexityScore,
      complexityClass: r.complexityClass,
      cancelled: r.cancelled,
      cancellationCategory: r.cancellationCategory,
    }));

    // Descriptive statistics for each numeric field over the cohort.
    const descriptive: Record<string, ReturnType<typeof describe>> = {};
    for (const field of Object.keys(NUMERIC_FIELDS)) {
      descriptive[field] = describe(rows.map((r) => NUMERIC_FIELDS[field](r)));
    }

    // Optional inferential test between two groups defined by a split field.
    let inferential: any = null;
    if (body.test && body.test.type) {
      const t = body.test;
      if ((t.type === 'ttest' || t.type === 'mannwhitney') && t.numericField && t.groupField && t.groupA && t.groupB) {
        const accessor = NUMERIC_FIELDS[t.numericField];
        const cat = CATEGORICAL_FIELDS[t.groupField];
        if (accessor && cat) {
          const groupA = rows.filter((r) => cat(r) === t.groupA).map(accessor);
          const groupB = rows.filter((r) => cat(r) === t.groupB).map(accessor);
          inferential = t.type === 'ttest' ? welchTTest(groupA, groupB) : mannWhitneyU(groupA, groupB);
          inferential = { ...inferential, numericField: t.numericField, groupField: t.groupField, groupA: t.groupA, groupB: t.groupB };
        }
      } else if (t.type === 'chisquare' && t.rowField && t.colField) {
        const rowCat = CATEGORICAL_FIELDS[t.rowField];
        const colCat = CATEGORICAL_FIELDS[t.colField];
        if (rowCat && colCat) {
          const rowVals = Array.from(new Set(rows.map(rowCat).filter(Boolean))) as string[];
          const colVals = Array.from(new Set(rows.map(colCat).filter(Boolean))) as string[];
          const matrix = rowVals.map((rv) => colVals.map((cv) => rows.filter((r) => rowCat(r) === rv && colCat(r) === cv).length));
          inferential = { ...chiSquare(matrix), rowField: t.rowField, colField: t.colField, rowVals, colVals, matrix };
        }
      } else if (t.type === 'pearson' && t.fieldX && t.fieldY) {
        const ax = NUMERIC_FIELDS[t.fieldX];
        const ay = NUMERIC_FIELDS[t.fieldY];
        if (ax && ay) {
          inferential = { test: 'Pearson correlation', statistic: pearson(rows.map(ax), rows.map(ay)), pValue: null, fieldX: t.fieldX, fieldY: t.fieldY };
        }
      }
    }

    return NextResponse.json({
      count: rows.length,
      descriptive,
      inferential,
      dataset: anonymized,
    });
  } catch (error) {
    console.error('Research query builder error:', error);
    return NextResponse.json({ error: 'Failed to run research query' }, { status: 500 });
  }
}
