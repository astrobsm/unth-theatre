import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { caseTeamSlots, CASE_TEAM_SELECT } from '@/lib/theatreOps/caseTeam';
import { readiness, summarise, type TeamMemberState, type CheckInStatus } from '@/lib/theatreOps/checkIn';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    /**
     * Three modes, because the board asked for everything and displayed almost
     * none of it.
     *
     * The page shows fifteen theatres. For each one it was loading the
     * allocation with EIGHT nested user relations — scrub nurse, circulating
     * nurse, technician, three grades of anaesthetist, cleaner, porter — plus
     * the day's surgeries with three more, plus team assignments, plus a phone
     * lookup for everybody named. All of it, for all fifteen, before the first
     * card could be painted. And a collapsed card shows a status dot and a name.
     *
     *   summary   the list: name, status, who logged the setup, whether there
     *             is a team worth opening. What a closed card can display.
     *   detail    one theatre, everything. Fetched when somebody opens it.
     *   (neither) the original whole-board response, kept so nothing that
     *             depended on it breaks.
     */
    const view = searchParams.get('view');
    const onlyTheatreId = searchParams.get('theatreId');
    const isSummary = view === 'summary';

    // Get all theatres — or the single one being opened.
    const theatres = await prisma.theatreSuite.findMany({
      where: onlyTheatreId ? { id: onlyTheatreId } : undefined,
      select: {
        id: true,
        name: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get setup logs for the date
    const setupLogs = await prisma.anesthesiaSetupLog.findMany({
      where: {
        setupDate: new Date(date),
      },
      include: {
        technician: {
          select: {
            fullName: true,
            staffCode: true,
          },
        },
        equipmentChecks: {
          where: {
            isFunctional: false,
          },
          select: {
            id: true,
            equipmentName: true,
            condition: true,
            malfunctionSeverity: true,
          },
        },
      },
      orderBy: { setupStartTime: 'desc' },
    });

    // Get allocations for the date with staff assignments
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // The expensive one: eight user relations per allocation. A closed card
    // shows none of it, so a summary never pays for it.
    const allocations = isSummary ? [] : await prisma.theatreAllocation.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        ...(onlyTheatreId ? { theatreId: onlyTheatreId } : {}),
      },
      include: {
        scrubNurse: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        circulatingNurse: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        anaestheticTechnician: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        anaesthetistConsultant: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        anaesthetistSeniorRegistrar: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        anaesthetistRegistrar: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        cleaner: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        porter: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
      },
    });

    // Explicitly assigned theatre team for the day's cases. Read once rather than
    // per theatre: one query for the whole board instead of one per room.
    const dayCaseIds = isSummary ? [] : (await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        ...(onlyTheatreId ? { theatreId: onlyTheatreId } : {}),
      },
      select: { id: true },
    })).map((s) => s.id);

    const assignedTeam = dayCaseIds.length
      ? await prisma.theatreTeamAssignment.findMany({
          where: { surgeryId: { in: dayCaseIds }, removedAt: null },
          select: { surgeryId: true, role: true, userId: true, userName: true },
          orderBy: { assignedAt: 'asc' },
        })
      : [];

    // Phone numbers matter here: this board is what somebody reads when they need
    // to call the person who has not arrived.
    const teamPhones = assignedTeam.length
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(new Set(assignedTeam.map((a) => a.userId))) } },
          select: { id: true, phoneNumber: true },
        })
      : [];
    const phoneById = new Map(teamPhones.map((u) => [u.id, u.phoneNumber ?? null]));

    // Get the day's surgeries (for surgeon + anaesthetist contacts per theatre)
    const surgeries = isSummary ? [] : await prisma.surgery.findMany({
      where: {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { not: 'CANCELLED' },
        ...(onlyTheatreId ? { theatreId: onlyTheatreId } : {}),
      },
      select: {
        // Who is expected, and whether each of them has said they are coming.
        // Readiness that counts equipment but not people answers the wrong
        // question: a prepared room with no anaesthetist is not a ready theatre.
        //
        // Spread FIRST, deliberately. CASE_TEAM_SELECT carries a narrow
        // surgeon/anaesthetist select (fullName only); this board needs the
        // phone numbers too, and whichever comes last wins. Spread it after
        // and the contact numbers vanish from a board whose whole purpose is
        // ringing the person who has not arrived.
        ...CASE_TEAM_SELECT,
        id: true,
        theatreId: true,
        theatreTechnicianId: true,
        surgeonName: true,
        surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        assistantSurgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
        teamCheckIns: { select: { userId: true, status: true, reason: true, etaMinutes: true } },
      },
    });

    // Resolve the per-case anaesthetic technician (soft ref to User.id, no relation).
    const techIds = Array.from(
      new Set(surgeries.map((s) => (s as any).theatreTechnicianId).filter((x): x is string => !!x))
    );
    const techUsers = techIds.length
      ? await prisma.user.findMany({ where: { id: { in: techIds } }, select: { id: true, fullName: true, phoneNumber: true } })
      : [];
    const techById = new Map(techUsers.map((u) => [u.id, u]));

    /**
     * For a summary, two counts instead of two joins.
     *
     * A closed card still has to say whether there is anything behind it —
     * "3 cases, team assigned" is what makes somebody tap. groupBy answers that
     * in one aggregate each, without loading a single user record.
     */
    const caseCounts = isSummary
      ? await prisma.surgery.groupBy({
          by: ['theatreId'],
          where: {
            scheduledDate: { gte: startOfDay, lte: endOfDay },
            status: { not: 'CANCELLED' },
          },
          _count: { _all: true },
        })
      : [];
    const allocCounts = isSummary
      ? await prisma.theatreAllocation.groupBy({
          by: ['theatreId'],
          where: { date: { gte: startOfDay, lte: endOfDay } },
          _count: { _all: true },
        })
      : [];
    const caseCountBy = new Map(caseCounts.map((c) => [c.theatreId, c._count._all]));
    const allocCountBy = new Map(allocCounts.map((c) => [c.theatreId, c._count._all]));

    // Helper: shape a User relation into a { name, phone } contact (or null)
    const contact = (u: { fullName: string; phoneNumber: string | null } | null | undefined) =>
      u ? { name: u.fullName, phone: u.phoneNumber || null } : null;

    // Create theatre status map
    const theatreStatus = theatres.map(theatre => {
      const setupLog = setupLogs.find(log => log.theatreId === theatre.id);
      const theatreAllocations = allocations.filter(a => a.theatreId === theatre.id);

      // Aggregate staff from allocations (name + phone for quick contact)
      const a0 = theatreAllocations[0];
      const staffAssignments = a0 ? {
        scrubNurse: contact(a0.scrubNurse),
        circulatingNurse: contact(a0.circulatingNurse),
        anaestheticTechnician: contact(a0.anaestheticTechnician),
        anaesthetistConsultant: contact(a0.anaesthetistConsultant),
        anaesthetistSeniorRegistrar: contact(a0.anaesthetistSeniorRegistrar),
        anaesthetistRegistrar: contact(a0.anaesthetistRegistrar),
        cleaner: contact(a0.cleaner),
        porter: contact(a0.porter),
        shift: a0.shift || null,
        surgicalUnit: a0.surgicalUnit || null,
        startTime: a0.startTime || null,
        endTime: a0.endTime || null,
      } : null;

      // Surgeons (and any surgery-level anaesthetists) scheduled in this theatre
      const theatreSurgeries = surgeries.filter(s => s.theatreId === theatre.id);

      /**
       * Team availability for this room, from the check-in board.
       *
       * The same definition of "who is on this case" the check-in screen uses
       * — imported, not re-derived, so the two boards cannot disagree about
       * whether a team is complete.
       *
       * Counted per PERSON across the room's cases, not per case: a scrub
       * nurse covering three lists in Theatre 4 is one person to chase, and
       * counting them three times would make one silent nurse look like three.
       * The first status found for someone wins, which matters only when a
       * person has answered for one case and not another — and in that case
       * they have demonstrably seen the board.
       */
      const seenPerson = new Set<string>();
      const roomTeam: TeamMemberState[] = [];
      const notComing: { name: string | null; roleOnCase: string; status: string; reason: string | null }[] = [];

      for (const sg of theatreSurgeries) {
        const checkInByUser = new Map(
          (sg.teamCheckIns ?? []).map((c) => [c.userId, c]),
        );
        for (const slot of caseTeamSlots(sg as never)) {
          if (seenPerson.has(slot.userId)) continue;
          seenPerson.add(slot.userId);
          const ci = checkInByUser.get(slot.userId);
          const status = (ci?.status as CheckInStatus | undefined) ?? null;
          roomTeam.push({
            userId: slot.userId,
            name: slot.name,
            roleOnCase: slot.roleOnCase,
            status,
          });
          // The actionable list: who is not going to be here, and why. This is
          // what a coordinator acts on — the counts only say how bad it is.
          if (status === 'UNAVAILABLE' || status === 'REPLACED' || status === 'DELAYED') {
            notComing.push({
              name: slot.name,
              roleOnCase: slot.roleOnCase,
              status,
              reason: ci?.reason ?? null,
            });
          }
        }
      }

      const teamReadiness = roomTeam.length ? readiness(roomTeam) : null;
      const theatreSurgeryIds = new Set(theatreSurgeries.map((s) => s.id));
      const surgeonMap = new Map<string, { name: string; phone: string | null }>();
      const anaesthetistMap = new Map<string, { name: string; phone: string | null }>();
      const technicianMap = new Map<string, { name: string; phone: string | null }>();
      // Nurses named through the team table, in addition to the single pair on
      // the allocation. Both are shown: a unit may have named a second scrub
      // nurse for a long list.
      const scrubFromTeam: { name: string; phone: string | null }[] = [];
      const circFromTeam: { name: string; phone: string | null }[] = [];
      for (const s of theatreSurgeries) {
        const surgeon = contact(s.surgeon) || (s.surgeonName ? { name: s.surgeonName, phone: null } : null);
        if (surgeon) surgeonMap.set(surgeon.name + (surgeon.phone || ''), surgeon);
        const assistant = contact(s.assistantSurgeon);
        if (assistant) surgeonMap.set(assistant.name + (assistant.phone || ''), assistant);
        const anaes = contact(s.anesthetist);
        if (anaes) anaesthetistMap.set(anaes.name + (anaes.phone || ''), anaes);
        const tech = contact(techById.get((s as any).theatreTechnicianId || ''));
        if (tech) technicianMap.set(tech.name + (tech.phone || ''), tech);
      }
      // People assigned explicitly by their own service, from
      // TheatreTeamAssignment — several per category, unlike the single columns
      // on TheatreAllocation. Merged into the same maps so the readiness board
      // shows one list per role rather than two that must be reconciled by eye.
      for (const a of assignedTeam) {
        if (!theatreSurgeryIds.has(a.surgeryId)) continue;
        const entry = { name: a.userName, phone: phoneById.get(a.userId) ?? null };
        const key = entry.name + (entry.phone || '');
        if (a.role === 'CONSULTANT_ANAESTHETIST' || a.role === 'ANAESTHETIST') {
          anaesthetistMap.set(key, entry);
        } else if (a.role === 'ANAESTHETIC_TECHNICIAN') {
          technicianMap.set(key, entry);
        } else if (a.role === 'SCRUB_NURSE') {
          scrubFromTeam.push(entry);
        } else if (a.role === 'CIRCULATING_NURSE') {
          circFromTeam.push(entry);
        }
      }

      const surgeons = Array.from(surgeonMap.values());
      const surgeryAnaesthetists = Array.from(anaesthetistMap.values());
      const surgeryTechnicians = Array.from(technicianMap.values());

      return {
        theatreId: theatre.id,
        theatreName: theatre.name,
        theatreStatus: theatre.status,
        hasSetupLog: !!setupLog,
        setupStatus: setupLog?.status || 'NOT_STARTED',
        isReady: setupLog?.isReady || false,
        technicianName: setupLog?.technician.fullName || null,
        technicianCode: setupLog?.technician.staffCode || null,
        setupStartTime: setupLog?.setupStartTime || null,
        readyTime: setupLog?.readyTime || null,
        locationName: setupLog?.locationName || null,
        locationAddress: setupLog?.locationAddress || null,
        latitude: setupLog?.latitude || null,
        longitude: setupLog?.longitude || null,
        locationAccuracy: setupLog?.locationAccuracy || null,
        distanceFromFacility: setupLog?.distanceFromFacility || null,
        malfunctioningEquipment: setupLog?.equipmentChecks.length || 0,
        blockingIssues: setupLog?.blockingIssues || null,
        setupNotes: setupLog?.setupNotes || null,
        durationMinutes: setupLog?.durationMinutes || null,
        staffAssignments,
        surgeons,
        surgeryAnaesthetists,
        surgeryTechnicians,
        // Named alongside the allocation's pair rather than replacing them, so a
        // board never silently loses somebody who was assigned the other way.
        teamScrubNurses: scrubFromTeam,
        teamCirculatingNurses: circFromTeam,
        totalAllocations: isSummary
          ? (allocCountBy.get(theatre.id) ?? 0)
          : theatreAllocations.length,
        // Summary only: what a closed card needs in order to be worth opening.
        caseCount: isSummary ? (caseCountBy.get(theatre.id) ?? 0) : surgeries.filter((x) => x.theatreId === theatre.id).length,
        // Has the team for this room said they are coming? Null when nobody is
        // assigned to the room today — which is different from "nobody has
        // answered", and must not read as a warning.
        teamReadiness,
        teamSummary: teamReadiness ? summarise(teamReadiness) : null,
        teamNotComing: notComing,
      };
    });

    // Count statistics
    const statistics = {
      totalTheatres: theatres.length,
      readyTheatres: theatreStatus.filter(t => t.isReady).length,
      inProgressTheatres: theatreStatus.filter(t => t.setupStatus === 'IN_PROGRESS').length,
      notStartedTheatres: theatreStatus.filter(t => t.setupStatus === 'NOT_STARTED').length,
      blockedTheatres: theatreStatus.filter(t => t.setupStatus === 'BLOCKED').length,
      totalMalfunctions: theatreStatus.reduce((sum, t) => sum + t.malfunctioningEquipment, 0),
    };

    return NextResponse.json({
      date,
      theatreStatus,
      statistics,
    });
  } catch (error) {
    console.error('Error fetching theatre readiness status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch theatre status' },
      { status: 500 }
    );
  }
}
