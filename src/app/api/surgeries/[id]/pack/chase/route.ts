import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { pushToUsers } from '@/lib/pushAll';
import {
  chaseState, cooldownProblem, packChaseMessage, chaseSummary,
  canChasePack, CONSUMABLE_ROLES, PHARMACY_ROLES,
  PACK_CHASE_COOLDOWN_MINUTES, type PackList,
} from '@/lib/packs/chase';

export const dynamic = 'force-dynamic';

/** How the chase messages are filed, so the cooldown can find them again. */
const RELATED_TYPE = 'SURGERY_PACK_CHASE';

/**
 * GET  /api/surgeries/[id]/pack/chase — what is outstanding and who holds it
 * POST /api/surgeries/[id]/pack/chase — ask them
 *
 * The pack editor has let the surgical team SEE and CHANGE both lists for some
 * time. What it has never had is a way to ask the two people holding them up
 * to get on with it. On an emergency that gap is the whole problem: the team
 * is chased, the blood is chased, and the pack is waited for in silence by
 * somebody standing outside a theatre.
 *
 * The GET exists so the screen can show the numbers to ring BEFORE anything is
 * sent. When the WhatsApp gateway is down — which it has been — a telephone
 * number on the screen is the feature and the queued message is the nicety.
 */
async function load(id: string) {
  const [consumables, pharmacy, surgery] = await Promise.all([
    prisma.surgeryConsumableRequest.findMany({
      where: { surgeryId: id },
      select: { id: true, name: true, quantity: true, unit: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.surgeryDrugDressingRequest.findMany({
      where: { surgeryId: id },
      select: { id: true, name: true, quantity: true, unit: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.surgery.findUnique({
      where: { id },
      select: {
        id: true, procedureName: true, status: true,
        scheduledDate: true, scheduledTime: true,
        // theatreId is a soft string reference with no relation, and location
        // is the complex rather than the room. The emergency booking carries
        // the room name, which is the one a provider can walk to.
        theatreId: true, location: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    }),
  ]);
  return { consumables, pharmacy, surgery };
}

async function recipientsFor(lists: PackList[]) {
  const roles: string[] = [];
  if (lists.includes('CONSUMABLE')) roles.push(...CONSUMABLE_ROLES);
  if (lists.includes('PHARMACY')) roles.push(...PHARMACY_ROLES);
  if (!roles.length) return [];
  return prisma.user.findMany({
    where: { role: { in: roles as never }, status: 'APPROVED' },
    select: { id: true, fullName: true, role: true, phoneNumber: true },
    orderBy: { fullName: 'asc' },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { consumables, pharmacy, surgery } = await load(params.id);
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    const state = chaseState(consumables, pharmacy);
    // Everybody who owns either list, not only the lists outstanding now: the
    // screen shows the numbers whether or not a message is warranted, because
    // ringing somebody is never the thing we should be refusing to help with.
    const people = await recipientsFor(['CONSUMABLE', 'PHARMACY']);

    const last = await prisma.communicationMessage.findFirst({
      where: { relatedType: RELATED_TYPE, relatedId: params.id },
      orderBy: { queuedAt: 'desc' },
      select: { queuedAt: true, createdByName: true },
    });

    return NextResponse.json({
      state,
      summary: chaseSummary(state),
      canChase: canChasePack((session.user as { role?: string }).role),
      cooldownMinutes: PACK_CHASE_COOLDOWN_MINUTES,
      lastChasedAt: last?.queuedAt ?? null,
      lastChasedBy: last?.createdByName ?? null,
      cooldown: cooldownProblem(last?.queuedAt ?? null, new Date()),
      recipients: people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        role: p.role,
        phoneNumber: p.phoneNumber,
        list: (CONSUMABLE_ROLES as string[]).includes(p.role as string) ? 'CONSUMABLE' : 'PHARMACY',
      })),
      surgery: {
        procedureName: surgery.procedureName,
        theatreName: surgery.location ?? null,
        patientName: surgery.patient?.name ?? null,
        folderNumber: surgery.patient?.folderNumber ?? null,
      },
    });
  } catch (error) {
    console.error('Error reading pack chase state:', error);
    return NextResponse.json({ error: 'Failed to read the pack state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? null;
  if (!canChasePack(role)) {
    return NextResponse.json(
      { error: 'Only the theatre team may chase a pack.' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const note: string = typeof body?.note === 'string' ? body.note.trim() : '';

    const { consumables, pharmacy, surgery } = await load(params.id);
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    const state = chaseState(consumables, pharmacy);
    if (!state.worth) {
      // Reported with the reason rather than as a bare refusal. "Build the
      // list first" and "everything is already packed" are opposite problems
      // and the person tapping the button has to be told which one they have.
      return NextResponse.json({ error: state.problem, state }, { status: 400 });
    }

    const now = new Date();
    const last = await prisma.communicationMessage.findFirst({
      where: { relatedType: RELATED_TYPE, relatedId: params.id },
      orderBy: { queuedAt: 'desc' },
      select: { queuedAt: true },
    });
    const cooling = cooldownProblem(last?.queuedAt ?? null, now);
    if (cooling) {
      return NextResponse.json({ error: cooling, state }, { status: 429 });
    }

    // An emergency booking, if this surgery came from one — it carries the
    // required-by time, which is the single most useful line in the message.
    const emergency = await prisma.emergencySurgeryBooking.findFirst({
      where: { surgeryId: params.id },
      select: { requiredByTime: true, priority: true, theatreName: true },
    });

    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true },
    });
    const fromName = actor?.fullName || session.user.name || 'the theatre team';

    const people = await recipientsFor(state.chase);
    const results: Array<{
      id: string; fullName: string; role: string; list: PackList;
      queued: boolean; reason: string | null; phoneNumber: string | null; text: string;
    }> = [];

    for (const person of people) {
      const list: PackList = (CONSUMABLE_ROLES as string[]).includes(person.role as string)
        ? 'CONSUMABLE'
        : 'PHARMACY';
      // Do not write to somebody about a list that is not outstanding.
      if (!state.chase.includes(list)) continue;

      let text = packChaseMessage({
        list,
        state,
        patientName: surgery.patient?.name ?? null,
        folderNumber: surgery.patient?.folderNumber ?? null,
        procedureName: surgery.procedureName,
        theatreName: emergency?.theatreName ?? surgery.location ?? null,
        requiredBy: emergency?.requiredByTime ?? null,
        emergency: !!emergency,
        priority: emergency?.priority ?? null,
        fromName,
      });
      if (note) text += `\n\n"${note}"`;

      const wa = person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null;
      const queued = await queueMessage({
        channel: 'WHATSAPP' as never,
        priority: (emergency ? 'URGENT' : 'HIGH') as never,
        recipientUserId: person.id,
        recipientName: person.fullName,
        recipientAddress: wa,
        recipientIsStaff: true,
        body: text,
        relatedType: RELATED_TYPE,
        relatedId: params.id,
        trigger: 'PACK_CHASE',
        // The minute is part of the identity, so a genuine second chase ten
        // minutes later is a new message rather than a swallowed duplicate.
        scope: `${list}:${now.toISOString().slice(0, 16)}`,
        createdById: session.user.id,
        createdByName: fromName,
      });

      results.push({
        id: person.id,
        fullName: person.fullName,
        role: person.role as string,
        list,
        queued: queued.queued,
        reason: queued.reason ?? (queued.duplicate ? 'Already queued' : null),
        phoneNumber: person.phoneNumber,
        // Handed back so the screen can offer a wa.me link. When the gateway
        // is down this is the part that still works.
        text,
      });

      await prisma.notification.create({
        data: {
          userId: person.id,
          type: 'PACK_CHASE',
          title: list === 'CONSUMABLE' ? 'Consumable pack outstanding' : 'Pharmacy pack outstanding',
          message: text,
          link: `/dashboard/surgeries/${params.id}`,
        },
      }).catch(() => {
        // The in-app copy is a convenience. Losing it must not lose the chase.
      });
    }

    if (results.length) {
      await pushToUsers(results.map((r) => r.id), {
        title: emergency ? 'EMERGENCY: pack outstanding' : 'Pack outstanding',
        body: chaseSummary(state),
        url: `/dashboard/surgeries/${params.id}`,
      }).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'surgery_pack_chase',
        recordId: params.id,
        changes: JSON.stringify({
          lists: state.chase,
          outstanding: {
            consumables: state.consumables.outstanding,
            pharmacy: state.pharmacy.outstanding,
          },
          recipients: results.map((r) => ({ id: r.id, role: r.role, queued: r.queued })),
          note: note || null,
          emergency: !!emergency,
        }),
      },
    }).catch(() => {});

    const sent = results.filter((r) => r.queued).length;
    return NextResponse.json({
      state,
      results,
      summary: chaseSummary(state),
      message: results.length === 0
        // Said plainly. Nobody with the role and an approved account means the
        // chase reached nobody, and a cheerful "sent" would be a lie.
        ? 'Nobody holds these lists on the system — no pack provider or pharmacist account is approved. Ring them instead; the careline numbers are on every dashboard.'
        : `${chaseSummary(state)} ${sent} of ${results.length} message${results.length === 1 ? '' : 's'} queued.`,
    });
  } catch (error) {
    console.error('Error chasing pack providers:', error);
    return NextResponse.json({ error: 'Failed to chase the providers' }, { status: 500 });
  }
}
