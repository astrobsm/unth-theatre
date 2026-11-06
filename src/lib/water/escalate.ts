// ============================================================
// What happens to the rest of the hospital when a water report is filed
// ------------------------------------------------------------
// One path, used by both water forms. The shift status report and the daily
// readiness report were written months apart and shared nothing, which is
// how they came to behave differently about the same water: one rang a bell
// for CRITICAL only, the other for NOT_READY only, and neither of them ever
// had to be revisited.
//
// Everything that happens on a bad report happens here:
//
//   1. Faults are opened for the areas that are not OK, refreshed for the
//      ones that were already open, and CLOSED for the ones this report
//      looked at again and found fine. That last one is the re-assessment,
//      and it is the only thing that closes a fault.
//
//   2. The head of water supply and the head of works are chased on
//      WhatsApp, with what is wrong, what has been tried, and what the
//      theatres are doing for water meanwhile.
//
//   3. Management get the same thing in the app, named by room.
//
// THE QUEUE IS NOT A DELIVERY. queueMessage writes a row for a provider that
// is configured on the cloud and not on the theatre server, so "chase
// queued" has historically meant nobody heard anything. Every reachable
// recipient therefore also comes back as a wa.me hand-off the person filing
// the report can press while they are still standing there. That is the part
// that actually reaches a phone tonight.
//
// NOTHING HERE MAY THROW INTO THE CALLER. The report has already been
// written by the time this runs, and a report that was saved but returned a
// 500 is the worst outcome available: the plumber files it again, and the
// theatre gets two faults for one leak. Every failure is caught, named in
// the result, and the report stands.
// ============================================================

import { prisma } from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { areasNotOk, type WaterArea } from './waterAreas';
import { reconcileIssues, needsRechase, type WaterIssueLike } from './issues';
import {
  DISTRESS_ROLES, buildWaterDistressMessage, distressNotificationLine,
} from './distress';

/** Who hears about it in the app, over and above the two who must fix it. */
const MANAGEMENT_ROLES = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  'CHIEF_MEDICAL_DIRECTOR', 'WORKS_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR',
];

export interface EscalateInput {
  source: 'STATUS' | 'READINESS';
  /** The report row this came from. */
  sourceId: string;
  /** EVERY area the report asked about, the OK ones included. */
  areas: readonly WaterArea[];
  contingencyPlan: string | null;
  loggedById: string;
  loggedByName: string;
  loggedByRole?: string | null;
  at: Date;
  overall?: string | null;
  overheadTankLevel?: number | null;
  groundTankLevel?: number | null;
  /** One sentence on where it was logged from, or null. */
  locationSentence?: string | null;
  /** The surgery day a readiness report covers, already in words. */
  forDate?: string | null;
}

export interface WhatsAppHandoff {
  name: string;
  kind: string;
  number: string;
  text: string;
}

export interface EscalateResult {
  /** Faults opened by this report. */
  opened: { areaKey: string; areaName: string; status: string }[];
  /** Faults this report closed by finding the area OK again. */
  closed: { areaKey: string; areaName: string; openedAt: Date }[];
  /** Still open after this report, including the ones it just opened. */
  openCount: number;
  handoffs: WhatsAppHandoff[];
  whatsappQueued: number;
  /** Why somebody was not reached. Shown to the person filing the report. */
  whatsappSkipped: string[];
}

const EMPTY: EscalateResult = {
  opened: [], closed: [], openCount: 0, handoffs: [], whatsappQueued: 0, whatsappSkipped: [],
};

/**
 * Open, refresh and close the faults this report implies, then chase.
 *
 * Returns what it did. Never throws.
 */
export async function escalateWaterReport(input: EscalateInput): Promise<EscalateResult> {
  try {
    const bad = areasNotOk(input.areas);

    const openRows = await prisma.waterAreaIssue.findMany({
      where: { resolvedAt: null },
      orderBy: { openedAt: 'asc' },
    });

    const plan = (input.contingencyPlan ?? '').trim() || null;
    const { toOpen, toUpdate, toClose } = reconcileIssues(
      openRows as unknown as WaterIssueLike[],
      input.areas,
    );

    // -- 1. The faults ----------------------------------------------------
    const opened: EscalateResult['opened'] = [];
    for (const area of toOpen) {
      try {
        await prisma.waterAreaIssue.create({
          data: {
            source: input.source,
            sourceId: input.sourceId,
            areaKey: area.key,
            areaName: area.name,
            location: area.location || null,
            status: area.status,
            problem: (area.problem ?? '').trim() || null,
            actionTaken: (area.actionTaken ?? '').trim() || null,
            contingencyPlan: plan,
            openedAt: input.at,
            openedById: input.loggedById,
            openedByName: input.loggedByName,
            lastSeenAt: input.at,
            lastSeenStatus: area.status,
          },
        });
        opened.push({ areaKey: area.key, areaName: area.name, status: area.status });
      } catch (e) {
        console.error('[water/escalate] could not open a fault for', area.key, e);
      }
    }

    for (const { issue, area } of toUpdate) {
      try {
        await prisma.waterAreaIssue.update({
          where: { id: issue.id },
          data: {
            // The newest description wins, but an empty one never erases the
            // one that is there: a hurried re-log with blank boxes must not
            // throw away the only account of what is wrong.
            status: area.status,
            lastSeenAt: input.at,
            lastSeenStatus: area.status,
            sightings: { increment: 1 },
            ...((area.problem ?? '').trim() ? { problem: (area.problem ?? '').trim() } : {}),
            ...((area.actionTaken ?? '').trim()
              ? { actionTaken: (area.actionTaken ?? '').trim() } : {}),
            ...(plan ? { contingencyPlan: plan } : {}),
          },
        });
      } catch (e) {
        console.error('[water/escalate] could not refresh fault', issue.id, e);
      }
    }

    const closed: EscalateResult['closed'] = [];
    for (const { issue } of toClose) {
      try {
        await prisma.waterAreaIssue.update({
          where: { id: issue.id },
          data: {
            resolvedAt: input.at,
            resolvedById: input.loggedById,
            resolvedByName: input.loggedByName,
            resolvedBySourceId: input.sourceId,
          },
        });
        closed.push({
          areaKey: issue.areaKey,
          areaName: issue.areaName,
          openedAt: new Date(issue.openedAt),
        });
      } catch (e) {
        console.error('[water/escalate] could not close fault', issue.id, e);
      }
    }

    const openCount = await prisma.waterAreaIssue.count({ where: { resolvedAt: null } })
      .catch(() => openRows.length - closed.length + opened.length);

    if (bad.length === 0) return { ...EMPTY, closed, openCount };

    // -- 2. The chase -----------------------------------------------------
    //
    // Sent when something is newly broken, and again when a fault that was
    // already open has outlived the assurance given about it. A report that
    // merely repeats this morning's unchanged fault an hour later does not
    // re-send: the two men being chased have phones, and a message that
    // arrives hourly about a thing they already know stops being read.
    const stale = toUpdate.some(({ issue }) => needsRechase(
      issue as unknown as WaterIssueLike & { lastChasedAt?: Date | null },
      input.at,
    ));
    const shouldChase = opened.length > 0 || stale;

    const handoffs: WhatsAppHandoff[] = [];
    const skipped: string[] = [];
    let queued = 0;

    if (shouldChase) {
      const recipients = await prisma.user.findMany({
        where: {
          status: 'APPROVED',
          role: { in: DISTRESS_ROLES.map((r) => r.role) as never },
        },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
      }).catch(() => []);

      for (const { role, label } of DISTRESS_ROLES) {
        const people = recipients.filter((r) => r.role === role);
        if (people.length === 0) {
          // Named, not swallowed. A hospital with no water-supply head on the
          // system is a fact the person filing the report should learn now,
          // not when nobody turns up.
          skipped.push(`No ${label} is registered on the system — nobody was chased in that role.`);
          continue;
        }
        for (const person of people) {
          const text = buildWaterDistressMessage({
            kind: input.source,
            recipientLabel: label,
            recipientName: person.fullName,
            areas: bad,
            contingencyPlan: plan,
            loggedByName: input.loggedByName,
            loggedByRole: input.loggedByRole ?? null,
            at: input.at,
            overall: input.overall ?? null,
            overheadTankLevel: input.overheadTankLevel ?? null,
            groundTankLevel: input.groundTankLevel ?? null,
            locationSentence: input.locationSentence ?? null,
            forDate: input.forDate ?? null,
            areasChecked: input.areas.length,
          });

          const wa = person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null;
          try {
            const q = await queueMessage({
              channel: 'WHATSAPP' as never,
              priority: 'URGENT' as never,
              recipientUserId: person.id,
              recipientName: person.fullName,
              recipientAddress: wa,
              recipientIsStaff: true,
              body: text,
              relatedType: input.source === 'STATUS' ? 'WATER_STATUS' : 'WATER_READINESS',
              relatedId: input.sourceId,
              trigger: 'WATER_DISTRESS',
              // Scoped per report and per person, so two faults on one
              // morning are two messages and not one sent twice.
              scope: `${input.sourceId}:${person.id}`,
              createdById: input.loggedById,
              createdByName: input.loggedByName,
            });
            if (q.queued) queued += 1;
            else if (q.reason) skipped.push(`${person.fullName}: ${q.reason}`);
          } catch (e) {
            console.error('[water/escalate] could not queue the chase:', e);
            skipped.push(`${person.fullName}: the message could not be queued, but the fault is recorded.`);
          }

          if (wa) handoffs.push({ name: person.fullName, kind: label, number: wa, text });
          else skipped.push(`${person.fullName} (${label}) has no phone number on file.`);
        }
      }

      await prisma.waterAreaIssue.updateMany({
        where: { resolvedAt: null, areaKey: { in: bad.map((a) => a.key) } },
        data: { lastChasedAt: input.at, chaseCount: { increment: 1 } },
      }).catch(() => undefined);
    }

    // -- 3. The app ---------------------------------------------------------
    try {
      const management = await prisma.user.findMany({
        where: { status: 'APPROVED', role: { in: MANAGEMENT_ROLES as never } },
        select: { id: true },
      });
      if (management.length > 0) {
        await prisma.notification.createMany({
          data: management.map((m) => ({
            userId: m.id,
            type: 'WATER_FAULT_OPEN',
            title: `🚰 Water fault — ${bad.length} area${bad.length === 1 ? '' : 's'} not OK`,
            message: `${distressNotificationLine(bad)}. `
              + `${plan ? `Plan B: ${plan}` : 'No plan B has been given.'} `
              + 'Open until somebody re-assesses it.',
            link: '/dashboard/plumbing-water-supply',
          })),
        });
      }
    } catch (e) {
      console.error('[water/escalate] notifications failed:', e);
    }

    return { opened, closed, openCount, handoffs, whatsappQueued: queued, whatsappSkipped: skipped };
  } catch (e) {
    console.error('[water/escalate] failed after the report was saved:', e);
    return {
      ...EMPTY,
      whatsappSkipped: ['The report was saved, but the chase could not be raised. Tell the head of works directly.'],
    };
  }
}
