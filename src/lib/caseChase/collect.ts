// ============================================================
// The cases with something missing, and whose they are
// ------------------------------------------------------------
// Read once, grouped twice: by the surgeon whose case it is, and by the unit
// consultant supervising it. The same case therefore appears in two messages,
// to two people, saying two different things — which is the point. The surgeon
// is asked to close the gap; the consultant is asked to speak to the people
// who left it.
//
// ONLY CASES THAT CAN STILL BE HELPED. A completed case cannot have its
// consent uploaded retrospectively in any sense worth having, and a cancelled
// one needs nothing. Chasing either teaches a surgeon that the message is
// automatic, and they are right.
// ============================================================

import prisma from '@/lib/prisma';
import { caseGaps, hoursLate, type CaseGapCode } from './gaps';
import { consultantIdsOf } from '@/lib/surgery/consultantIds';

/** A case, as a message needs it. */
export interface ChaseCase {
  id: string;
  procedureName: string;
  /** YYYY-MM-DD, as the theatre reads it. */
  scheduledDay: string;
  scheduledTime: string | null;
  surgeryType: string | null;
  status: string;

  patientName: string | null;
  folderNumber: string | null;
  unit: string | null;

  /** Whose case it is. */
  surgeonId: string | null;
  surgeonName: string | null;
  /** Who supervises the unit for this case. */
  /// A comma-joined LIST on a shared unit. Read it with consultantIdsOf;
  /// never compare it to a user id directly.
  consultantId: string | null;
  consultantName: string | null;
  /** Who actually entered the booking — usually a resident or a booking officer. */
  bookedById: string | null;
  bookedByName: string | null;

  gaps: CaseGapCode[];
  hoursLate: number | null;
}

const day = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');

/**
 * Every case in the window that is still missing something.
 *
 * The window is on the OPERATION date, not the booking date: the question a
 * surgeon is being asked is about the cases they are about to operate on.
 */
export async function collectCasesWithGaps(from: string, to: string): Promise<ChaseCase[]> {
  const rows = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      // A cancelled case needs nothing and a finished one cannot be helped.
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
    },
    select: {
      id: true,
      procedureName: true,
      scheduledDate: true,
      scheduledTime: true,
      surgeryType: true,
      status: true,
      createdAt: true,
      unit: true,
      surgeonId: true,
      surgeonName: true,
      supervisingConsultantId: true,
      supervisingConsultantName: true,
      bookedById: true,
      bookedByName: true,
      // Consent as the theatre can see it. The file CONTENTS are deliberately
      // not selected: the question is whether one exists, and the base64
      // column answers it at a thousand times the cost.
      consentFileName: true,
      consentUploadedAt: true,
      consentSignedElectronically: true,
      consentCompletedAt: true,
      patient: { select: { name: true, folderNumber: true } },
      _count: { select: { consumableRequests: true, drugDressingRequests: true } },
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
  });

  const out: ChaseCase[] = [];

  rows.forEach((r) => {
    const forGaps = {
      scheduledDate: r.scheduledDate,
      bookedAt: r.createdAt,
      surgeryType: r.surgeryType ? String(r.surgeryType) : null,
      consentFileName: r.consentFileName,
      consentUploadedAt: r.consentUploadedAt,
      consentSignedElectronically: r.consentSignedElectronically,
      consentCompletedAt: r.consentCompletedAt,
      // drugDressingRequests, and ONLY that: it is the same count the booking
      // form's own pre-op check uses, so the gap means the same thing here as
      // it does on the booking screen and on the case card.
      //
      // The ANAESTHETIC prescription is deliberately not counted. It is also
      // pharmacy work, but it is written by the anaesthetist at the pre-op
      // review — including it would let a case with an anaesthetic
      // prescription and no surgical drug list read as complete, which is
      // precisely the case pharmacy has nothing to pack for.
      prescriptionCount: r._count.drugDressingRequests,
      consumableCount: r._count.consumableRequests,
    };

    const gaps = caseGaps(forGaps);
    if (gaps.length === 0) return;

    out.push({
      id: r.id,
      procedureName: r.procedureName,
      scheduledDay: day(r.scheduledDate),
      scheduledTime: r.scheduledTime ?? null,
      surgeryType: r.surgeryType ? String(r.surgeryType) : null,
      status: String(r.status),
      patientName: r.patient?.name ?? null,
      folderNumber: r.patient?.folderNumber ?? null,
      unit: r.unit ?? null,
      surgeonId: r.surgeonId ?? null,
      surgeonName: r.surgeonName ?? null,
      consultantId: r.supervisingConsultantId ?? null,
      consultantName: r.supervisingConsultantName ?? null,
      bookedById: r.bookedById ?? null,
      bookedByName: r.bookedByName ?? null,
      gaps,
      hoursLate: hoursLate(forGaps),
    });
  });

  return out;
}

/** One person's cases, and what is wrong with them. */
export interface ChaseGroup {
  personId: string;
  personName: string;
  /** The units these cases belong to. Usually one. */
  units: string[];
  cases: ChaseCase[];
  /** How many cases carry each gap. */
  counts: Record<CaseGapCode, number>;
  /** Cases with something still fixable — consent, pharmacy, consumables. */
  fixable: number;
  lateCount: number;
}

const emptyCounts = (): Record<CaseGapCode, number> => ({
  LATE_BOOKING: 0, CONSENT: 0, PRESCRIPTION: 0, CONSUMABLES: 0,
});

/**
 * Group the cases by a person.
 *
 * `pick` says which person: the operating surgeon, or the supervising
 * consultant. Written once and used twice rather than two near-identical
 * loops, because the two groupings must agree about what a gap is.
 *
 * A case with nobody in that position is skipped rather than filed under a
 * placeholder. "Unrecorded" as a recipient is not a person, and a tally
 * against that name is a tally nobody can act on — the board reports those
 * cases separately instead, which is what makes them fixable.
 */
/**
 * `pick` may return SEVERAL people for one case.
 *
 * A case supervised by two consultants belongs in both their groups: they
 * both supervise it, and a chase that reached only one of them would let the
 * other answer for nothing. Before this, the consultant key was the raw
 * supervisingConsultantId column -- a comma-joined list on a shared unit --
 * so such cases grouped under a composite that matched no real person, and
 * the send route told the operator, untruthfully, that the consultant "is not
 * recorded as the supervising consultant on any case".
 */
export function groupBy(
  cases: readonly ChaseCase[],
  pick: (c: ChaseCase) => { id: string | null; name: string | null }
    | { id: string | null; name: string | null }[],
): ChaseGroup[] {
  const byId: Record<string, ChaseGroup> = {};
  const order: string[] = [];

  cases.forEach((c) => {
    const picked = pick(c);
    (Array.isArray(picked) ? picked : [picked]).forEach((who) => {
    if (!who.id) return;
    if (!byId[who.id]) {
      byId[who.id] = {
        personId: who.id,
        personName: who.name || 'Colleague',
        units: [],
        cases: [],
        counts: emptyCounts(),
        fixable: 0,
        lateCount: 0,
      };
      order.push(who.id);
    }
    const g = byId[who.id];
    g.cases.push(c);
    c.gaps.forEach((code) => { g.counts[code] += 1; });
    if (c.gaps.some((code) => code !== 'LATE_BOOKING')) g.fixable += 1;
    if (c.gaps.indexOf('LATE_BOOKING') !== -1) g.lateCount += 1;
    if (c.unit && g.units.indexOf(c.unit) === -1) g.units.push(c.unit);
    });
  });

  // Most to answer for first — but by cases that can still be FIXED, not by
  // total gaps. A list headed by somebody whose only mark is three late
  // bookings nobody can now un-book puts the unactionable at the top.
  return order
    .map((id) => byId[id])
    .sort((a, b) => (b.fixable - a.fixable) || (b.cases.length - a.cases.length));
}

/** The cases with no surgeon, or no supervising consultant, named. */
export function unattributed(cases: readonly ChaseCase[]): {
  noSurgeon: ChaseCase[];
  noConsultant: ChaseCase[];
} {
  return {
    noSurgeon: cases.filter((c) => !c.surgeonId),
    // Derived, not stored. A case naming two consultants is attributed, and
    // a case whose column holds something that is not an id is not -- which
    // plain `!c.consultantId` could not tell apart.
    noConsultant: cases.filter((c) => consultantIdsOf(c.consultantId).length === 0),
  };
}
