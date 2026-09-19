import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import {
  listFor, progress, readinessAnnouncement, type Ticks,
} from '@/lib/theatre/readiness';
import { dayKey, parseTheatreDay, theatreDay } from '@/lib/theatre/day';

export const dynamic = 'force-dynamic';

/**
 * Theatre readiness, standing on its own.
 *
 * It used to hang off theatre_setups — the material COLLECTION record — so a
 * nurse in a fully prepared theatre could not say it was ready until somebody
 * had first entered a stores document. That is what "No material collection
 * recorded for today yet" meant on the setup screen: not that the theatre was
 * unready, but that the paperwork for the trolley had not been typed in.
 *
 * Now: pick your theatre, tick your list, and the radio says so. The scrub
 * nurse and the theatre technician each answer for their own side, because the
 * machine, the gases and the airway are not the scrub nurse's to vouch for.
 */

/**
 * Who may tick which list.
 *
 * A theatre manager or administrator may record either, because on a day when
 * the named person is scrubbed and their hands are not free, somebody has to
 * be able to enter it — and the record keeps the name of whoever actually did.
 */
const MAY_CONFIRM: Record<string, string[]> = {
  SCRUB_NURSE: [
    'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE',
    'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  ],
  THEATRE_TECHNICIAN: [
    'ANAESTHETIC_TECHNICIAN', 'BIOMEDICAL_ENGINEER',
    'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'HEAD_OF_ANAESTHESIA',
    'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  ],
};

/** GET /api/theatre-readiness?date=YYYY-MM-DD — the day's confirmations. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const day = parseTheatreDay(request.nextUrl.searchParams.get('date'));

    const [confirmations, theatres] = await Promise.all([
      prisma.theatreReadinessConfirmation.findMany({
        where: { readyDate: day },
        orderBy: [{ theatreName: 'asc' }, { role: 'asc' }],
      }),
      prisma.theatreSuite.findMany({
        // The holding area and PACU are not places to operate, so there is
        // nothing for a scrub nurse or a technician to declare ready in them.
        where: { isOperatingRoom: true },
        select: { id: true, name: true, location: true },
        orderBy: { name: 'asc' },
      }).catch(() => []),
    ]);

    return NextResponse.json({
      date: dayKey(day),
      theatres,
      confirmations: confirmations.map((c) => ({
        ...c,
        ticks: parseTicks(c.ticks),
        // Counted here so every reader agrees. A screen recomputing it from a
        // stale copy of the list is how two boards come to disagree.
        progress: progress(c.role, parseTicks(c.ticks)),
      })),
    });
  } catch (error) {
    return apiError('theatre-readiness GET', error);
  }
}

function parseTicks(raw: string | null): Ticks {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Ticks = {};
    Object.keys(parsed as Record<string, unknown>).forEach((k) => {
      out[k] = Boolean((parsed as Record<string, unknown>)[k]);
    });
    return out;
  } catch {
    return {};
  }
}

/**
 * POST /api/theatre-readiness
 *
 * Saves the ticks. When every required one is ticked, and only the first time,
 * raises the radio announcement — whose text repeats three times, as the
 * theatre asked.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const theatreId = typeof body.theatreId === 'string' ? body.theatreId.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

    const list = listFor(role);
    if (!theatreId || !list) {
      return NextResponse.json(
        { error: 'Choose your theatre and which list you are confirming.' },
        { status: 400 },
      );
    }

    const userRole = (session.user.role ?? '').toUpperCase();
    if (!(MAY_CONFIRM[role] ?? []).includes(userRole)) {
      return NextResponse.json({
        error: role === 'SCRUB_NURSE'
          ? 'The scrub nurse list is confirmed by theatre nursing staff.'
          : 'The technician list is confirmed by anaesthetic technicians and anaesthetists.',
        code: 'NOT_YOUR_LIST',
      }, { status: 403 });
    }

    // Only ticks the list actually contains. A caller sending arbitrary keys
    // must not be able to write them into a clinical record.
    const sent = (body.ticks ?? {}) as Record<string, unknown>;
    const ticks: Ticks = {};
    list.checks.forEach((c) => { if (sent[c.id]) ticks[c.id] = true; });

    const theatre = await prisma.theatreSuite.findUnique({
      where: { id: theatreId },
      select: { id: true, name: true },
    });
    if (!theatre) {
      return NextResponse.json({ error: 'That theatre is not on file.' }, { status: 404 });
    }

    const state = progress(role, ticks);
    const day = theatreDay();
    const confirmedByName = session.user.name || 'Theatre staff';

    const existing = await prisma.theatreReadinessConfirmation.findUnique({
      where: {
        theatreId_readyDate_role: {
          theatreId, readyDate: day, role: role as 'SCRUB_NURSE' | 'THEATRE_TECHNICIAN',
        },
      },
    });

    // Announce on the transition into complete, and only once. Re-ticking a
    // box on a theatre already announced must not put it on the radio again.
    const announceNow = state.complete && !existing?.announcedAt;

    const saved = await prisma.theatreReadinessConfirmation.upsert({
      where: {
        theatreId_readyDate_role: {
          theatreId, readyDate: day, role: role as 'SCRUB_NURSE' | 'THEATRE_TECHNICIAN',
        },
      },
      create: {
        theatreId,
        theatreName: theatre.name,
        readyDate: day,
        role: role as 'SCRUB_NURSE' | 'THEATRE_TECHNICIAN',
        confirmedById: session.user.id,
        confirmedByName,
        checklistVersion: list.version,
        ticks: JSON.stringify(ticks),
        note: note || null,
        complete: state.complete,
        completedAt: state.complete ? new Date() : null,
        announcedAt: announceNow ? new Date() : null,
      },
      update: {
        theatreName: theatre.name,
        // The record follows whoever last confirmed it. A theatre handed over
        // mid-morning must name the person now standing in it.
        confirmedById: session.user.id,
        confirmedByName,
        checklistVersion: list.version,
        ticks: JSON.stringify(ticks),
        note: note || null,
        complete: state.complete,
        completedAt: state.complete ? (existing?.completedAt ?? new Date()) : null,
        ...(announceNow ? { announcedAt: new Date() } : {}),
      },
    });

    let announced = false;
    if (announceNow) {
      const { title, message } = readinessAnnouncement({
        theatreName: theatre.name,
        role,
        confirmedByName,
        note,
      });
      try {
        await prisma.radioAnnouncement.create({
          data: {
            category: 'WORKFLOW',
            title,
            message,
            priority: 75,
            location: theatre.name,
            urgency: 'HIGH',
            triggerSource: 'EVENT',
            status: 'PENDING',
            triggeredById: session.user.id,
            // Indexable, so the scheduler never has to substring-match JSON.
            dedupeKey: `theatreReadiness:${saved.id}`,
            metadata: JSON.stringify({
              source: 'TheatreReadiness',
              confirmationId: saved.id,
              theatreId,
              role,
            }),
          },
        });
        announced = true;
      } catch (err) {
        // A failed announcement must not lose the confirmation. The theatre is
        // ready either way; the response says the radio did not carry it so
        // somebody can say it over the handset instead.
        console.error('[theatre-readiness] announcement failed:', err);
      }
    }

    return NextResponse.json({
      confirmation: { ...saved, ticks, progress: state },
      announced,
      announcementFailed: announceNow && !announced,
    });
  } catch (error) {
    return apiError('theatre-readiness POST', error);
  }
}
