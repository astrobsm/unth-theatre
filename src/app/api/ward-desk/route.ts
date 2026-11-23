/**
 * The Ward Desk: one ward's theatre cases, for the nurse in charge of it.
 *
 * SCOPE IS READ FROM THE DATABASE, NOT FROM THE SESSION.
 *
 * `wardAssignment` is deliberately NOT carried on the JWT beside role and
 * extraModules. A session token lives until it is refreshed, so a posting an
 * administrator corrected this morning would go on scoping this desk to the
 * old ward until the nurse signed out and in again — and the nurse would have
 * no way to tell. One extra user lookup per request is the cost of the ward
 * being right now rather than eventually.
 *
 * A POSTED NURSE IS STILL CONFINED TO THEIR POSTING. What changed on 23
 * November is the other half: an administrator or theatre manager, who has no
 * posting at all, may now name a ward or ask for ALL of them. That is not a
 * loosening of the nurse's scope — `isWardPostedRole` still decides, and a
 * ward nurse asking for ?ward=ALL gets their own ward exactly as before.
 *
 * WHAT A NURSE NEEDS TO KNOW BEFORE SENDING A PATIENT. Four things used to be
 * answered by telephone and are now on the card: has the deposit been paid,
 * are the consumables and the drugs packed, has the anaesthetist reviewed the
 * patient, and who that anaesthetist is.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { hasModuleAccess } from '@/lib/modules';
import {
  wardScopeOf,
  normaliseWard,
  isWardPostedRole,
  WARD_ACTIONABLE_SURGERY_STATUSES,
  wardsMatch,
} from '@/lib/ward/nurseInCharge';
import { allFeeFields } from '@/lib/deposits/depositBands';

export const dynamic = 'force-dynamic';

/** Nigeria (WAT) is UTC+1 with no DST. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The sentinel for "every ward", which only an unposted account may ask for. */
const ALL_WARDS = 'ALL';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasModuleAccess(session.user.role, session.user.extraModules, 'ward-desk')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, fullName: true, role: true, wardAssignment: true },
    });
    if (!me) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    /**
     * Whose ward.
     *
     * A ward-posted account — nurse-in-charge or health assistant — is confined
     * to their posting, and nothing in the query string changes that. Anyone
     * else reaching this page is an administrator or a manager: they may name
     * a ward, or ALL, and are told plainly which they are looking at.
     */
    const rawAsked = (request.nextUrl.searchParams.get('ward') ?? '').trim();
    const wantsAll = rawAsked.toUpperCase() === ALL_WARDS;
    const asked = wantsAll ? null : normaliseWard(rawAsked);
    const scope = wardScopeOf(me);
    const posted = isWardPostedRole(me.role);

    let ward: string | null;
    let viewingAs: 'own' | 'chosen' | 'all' | 'none';

    if (posted) {
      if (!scope.assigned) {
        return NextResponse.json({
          ward: null, viewingAs: 'none', reason: scope.reason, cases: [], canChooseWard: false,
        });
      }
      // Their own ward, whatever the query string says.
      ward = scope.ward;
      viewingAs = 'own';
    } else if (wantsAll) {
      ward = null;
      viewingAs = 'all';
    } else if (asked) {
      ward = asked;
      viewingAs = 'chosen';
    } else if (scope.assigned) {
      ward = scope.ward;
      viewingAs = 'own';
    } else {
      // An unposted account that has not chosen yet. NOT an error, and not a
      // dead end: the client is told it may choose, and offers the list.
      return NextResponse.json({
        ward: null,
        viewingAs: 'none',
        canChooseWard: true,
        reason: 'Your account has no ward of its own. Choose a ward, or look at every ward at once.',
        cases: [],
      });
    }

    /**
     * The window.
     *
     * A named date is one day: that is what a nurse asking "who is going
     * tomorrow?" means. With no date the window is yesterday to three days
     * ahead — a case on this morning's list that has not gone yet is the one
     * the nurse is standing next to, a case due tomorrow is the one they are
     * preparing for tonight, and yesterday is included because a handover
     * written up the next morning is still worth having.
     */
    const dateParam = (request.nextUrl.searchParams.get('date') ?? '').trim();
    let from: Date;
    let to: Date;
    let singleDay = false;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const start = new Date(`${dateParam}T00:00:00`);
      if (!isNaN(start.getTime())) {
        from = start;
        to = new Date(`${dateParam}T23:59:59.999`);
        singleDay = true;
      }
    }
    if (!singleDay) {
      from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setTime(from.getTime() - DAY_MS);
      to = new Date(from.getTime() + 5 * DAY_MS);
    }

    /**
     * The ward is matched in JS, not in the WHERE clause.
     *
     * `{ equals: ward, mode: 'insensitive' }` reads like the right thing and
     * is subtly wrong: it folds case but not inner whitespace. Patient.ward
     * is free text behind an "OTHERS (SPECIFY)" option, so one typed
     * "WARD  6B" would never match a posting of "WARD 6B" — and the nurse in
     * charge of that ward would read the omission as "no cases today" rather
     * than as a mismatch. A patient invisible to their own ward is the one
     * failure this desk must not have.
     *
     * wardsMatch() normalises both sides, and it is the SAME function the
     * write path uses to decide whether a case is yours, so the desk cannot
     * show a case it would then refuse to accept a handover for. The window
     * is five days at most, which is tens of rows, so the cost of filtering
     * here is not worth a second way of comparing ward names.
     */
    const inWindow = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: from!, lte: to! },
        status: { in: WARD_ACTIONABLE_SURGERY_STATUSES as unknown as never[] },
      },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        magnitude: true,
        status: true,
        surgeryType: true,
        isDayCase: true,
        unit: true,
        location: true,
        surgeonName: true,
        patient: { select: { id: true, name: true, folderNumber: true, ward: true, age: true, ageUnit: true, gender: true } },
        surgeon: { select: { fullName: true } },
        patientCallUps: {
          orderBy: { invitedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            invitedAt: true,
            invitedByName: true,
            theatreName: true,
            patientEnRouteAt: true,
            patientArrivedAt: true,
            theatrePorterArrivedAtWardTime: true,
            theatrePorterDepartedWardTime: true,
            wardNurseName: true,
            wardEntriesNotes: true,
            wardEntriesRecordedByName: true,
            wardEntriesRecordedAt: true,
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    // viewingAs 'all' keeps every case, including those whose patient has no
    // ward recorded at all — those are precisely the ones somebody needs to go
    // and fix, and hiding them is how they stay unfixed.
    const surgeries = ward === null ? inWindow : inWindow.filter((s) => wardsMatch(s.patient?.ward, ward));
    const ids = surgeries.map((s) => s.id);

    /**
     * Everything the ward reads but does not write, in one round of queries
     * rather than one round per case. A thirty-case day would otherwise be a
     * hundred and twenty round trips, and this page is opened on a handset
     * over hospital wifi.
     */
    const [deposits, collections, consumables, drugs, reviews, settingsRow] = await Promise.all([
      ids.length ? prisma.surgeryDeposit.findMany({ where: { surgeryId: { in: ids } } }) : [],
      ids.length ? prisma.surgeryPackCollection.findMany({ where: { surgeryId: { in: ids } } }) : [],
      ids.length
        ? prisma.surgeryConsumableRequest.findMany({
            where: { surgeryId: { in: ids } },
            select: { surgeryId: true, status: true },
          })
        : [],
      ids.length
        ? prisma.surgeryDrugDressingRequest.findMany({
            where: { surgeryId: { in: ids } },
            select: { surgeryId: true, status: true },
          })
        : [],
      ids.length
        ? prisma.preopReviewAssignment.findMany({
            where: { surgeryId: { in: ids } },
            select: {
              surgeryId: true,
              expectedReviewerName: true,
              reassignedToName: true,
              reviewedAt: true,
              handedBackAt: true,
              patientAbsentAt: true,
              lapsedAt: true,
            },
          })
        : [],
      prisma.theatreSetting.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton' },
        update: {},
      }),
    ]);

    const settings: Record<string, string | null> = {};
    for (const f of allFeeFields()) {
      const v = (settingsRow as unknown as Record<string, unknown>)[f] as { toString(): string } | null;
      settings[f] = v == null ? null : v.toString();
    }

    const depBy = new Map<string, (typeof deposits)[number][]>();
    for (const d of deposits) {
      if (!depBy.has(d.surgeryId)) depBy.set(d.surgeryId, []);
      depBy.get(d.surgeryId)!.push(d);
    }
    const colBy = new Map<string, (typeof collections)[number][]>();
    for (const c of collections) {
      if (!colBy.has(c.surgeryId)) colBy.set(c.surgeryId, []);
      colBy.get(c.surgeryId)!.push(c);
    }
    const reviewBy = new Map(reviews.map((r) => [r.surgeryId, r]));

    /** Ready / total, counting a cancelled line as neither. */
    const tally = (rows: { surgeryId: string; status: string }[], id: string) => {
      const mine = rows.filter((r) => r.surgeryId === id && r.status !== 'CANCELLED');
      const done = mine.filter((r) => r.status === 'PACKED' || r.status === 'DELIVERED').length;
      return { total: mine.length, ready: done };
    };

    const cases = surgeries.map((s) => {
      const callUp = s.patientCallUps[0] ?? null;
      const r = reviewBy.get(s.id) ?? null;
      return {
        surgeryId: s.id,
        patientName: s.patient?.name ?? 'Unknown',
        folderNumber: s.patient?.folderNumber ?? '',
        age: s.patient?.age ?? null,
        ageUnit: s.patient?.ageUnit ?? null,
        gender: s.patient?.gender ?? null,
        ward: s.patient?.ward ?? null,
        procedureName: s.procedureName,
        scheduledDate: s.scheduledDate.toISOString(),
        scheduledTime: s.scheduledTime,
        magnitude: s.magnitude,
        status: s.status,
        surgeryType: s.surgeryType,
        isDayCase: s.isDayCase,
        unit: s.unit,
        location: s.location,
        surgeonName: s.surgeon?.fullName || s.surgeonName || null,

        /** Money. Read-only here: the ward never records a payment. */
        deposits: (depBy.get(s.id) ?? []).map((d) => ({
          kind: d.kind,
          status: d.status,
          expectedAmount: d.expectedAmount == null ? null : d.expectedAmount.toString(),
          amountPaid: d.amountPaid == null ? null : d.amountPaid.toString(),
          receiptNumber: d.receiptNumber,
          paidAt: d.paidAt ? d.paidAt.toISOString() : null,
        })),
        collections: (colBy.get(s.id) ?? []).map((c) => ({
          stream: c.stream,
          collectedByName: c.collectedByName,
          collectedAt: c.collectedAt ? c.collectedAt.toISOString() : null,
        })),

        /** Supplies. "6 of 7 packed" is what the ward actually asks. */
        consumables: tally(consumables, s.id),
        drugs: tally(drugs, s.id),

        /**
         * The anaesthesia review. A reassignment outranks the roster name:
         * the person who will actually come is the one the ward should be
         * expecting, and telephoning the original name wastes an evening.
         */
        review: r
          ? {
              anaesthetist: r.reassignedToName || r.expectedReviewerName || null,
              reassigned: Boolean(r.reassignedToName),
              reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
              handedBack: Boolean(r.handedBackAt),
              patientAbsent: Boolean(r.patientAbsentAt),
              lapsed: Boolean(r.lapsedAt),
            }
          : null,

        // Null until the theatre sends for the patient. The ward can do nothing
        // but look until then, which is itself worth showing.
        callUp: callUp
          ? {
              id: callUp.id,
              status: callUp.status,
              theatreName: callUp.theatreName,
              invitedAt: callUp.invitedAt?.toISOString() ?? null,
              invitedByName: callUp.invitedByName,
              patientEnRouteAt: callUp.patientEnRouteAt?.toISOString() ?? null,
              patientArrivedAt: callUp.patientArrivedAt?.toISOString() ?? null,
              porterArrivedAtWard: callUp.theatrePorterArrivedAtWardTime?.toISOString() ?? null,
              porterDepartedWard: callUp.theatrePorterDepartedWardTime?.toISOString() ?? null,
              wardNurseName: callUp.wardNurseName,
              notes: callUp.wardEntriesNotes,
              recordedByName: callUp.wardEntriesRecordedByName,
              recordedAt: callUp.wardEntriesRecordedAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({
      ward,
      viewingAs,
      canChooseWard: !posted,
      nurseName: me.fullName,
      role: me.role,
      date: singleDay ? dateParam : null,
      from: from!.toISOString(),
      to: to!.toISOString(),
      settings,
      cases,
    });
  } catch (error: any) {
    console.error('Ward desk GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
