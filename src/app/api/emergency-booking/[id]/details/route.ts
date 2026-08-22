import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { BASE_PACK_LABEL } from '@/lib/baseConsumablePack';

export const dynamic = 'force-dynamic';

/**
 * The rest of an emergency booking, after the theatre has already been told.
 *
 * The booking is submitted once the patient and the surgery details are known,
 * because that is the moment the theatre can start preparing — and in an
 * emergency, the minutes spent completing consent and pack lists are minutes
 * the theatre could have spent getting a room ready. What is NOT yet done is
 * carried as outstanding items, and the holding area refuses the patient
 * without them.
 *
 * So this endpoint exists to finish a booking that is already live: the team,
 * the consent (uploaded or electronic), and the consumable and drug lists.
 *
 * Every part is optional and applied only if present. A booker who completes
 * consent now and packs in ten minutes makes two calls, and neither wipes what
 * the other saved.
 */

const packItem = z.object({
  templateId: z.string().nullish(),
  name: z.string().min(1),
  category: z.string(),
  size: z.string().nullish(),
  unit: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().nullish(),
});

const drugItem = z.object({
  templateId: z.string().nullish(),
  name: z.string().min(1),
  type: z.string(),
  dosage: z.string().nullish(),
  route: z.string().nullish(),
  quantity: z.number().int().positive(),
  unit: z.string(),
  notes: z.string().nullish(),
});

const schema = z.object({
  step: z.enum(['team', 'consent', 'packs']).optional(),
  teamMembers: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.enum(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER']),
        userId: z.string().nullish(),
      }),
    )
    .optional(),
  consentForm: z.any().optional(),
  consentFile: z
    .object({
      name: z.string(),
      mimeType: z.string(),
      base64: z.string(),
    })
    .optional(),
  consumableRequests: z.array(packItem).optional(),
  drugDressingRequests: z.array(drugItem).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const booking = await prisma.emergencySurgeryBooking.findUnique({
    where: { id: params.id },
    select: { id: true, surgeryId: true, patientName: true, procedureName: true },
  });
  if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

  // Everything below hangs off the Surgery record. A booking without one has
  // not been through approval yet, and writing packs against nothing would
  // fail silently later rather than loudly now.
  if (!booking.surgeryId) {
    return NextResponse.json(
      { error: 'This booking has no theatre case yet. Try again in a moment.' },
      { status: 409 },
    );
  }
  const surgeryId = booking.surgeryId;
  const applied: string[] = [];

  // ── Team ────────────────────────────────────────────────────────────────
  if (body.teamMembers?.length) {
    // Replace rather than append: the person is editing one list, and appending
    // would double the team every time they went back a step and forward again.
    await prisma.surgicalTeamMember.deleteMany({ where: { surgeryId } });
    await prisma.surgicalTeamMember.createMany({
      data: body.teamMembers.map((m) => ({
        surgeryId,
        memberName: m.name,
        role: m.role as never,
        userId: m.userId ?? null,
      })),
    });
    applied.push('team');
  }

  // ── Consent ─────────────────────────────────────────────────────────────
  const consentData: Record<string, unknown> = {};
  if (body.consentFile?.base64) {
    consentData.consentFileName = body.consentFile.name;
    consentData.consentFileMimeType = body.consentFile.mimeType;
    // Accept a data: URL or a bare base64 string; the browser produces the
    // former and a retry from a queued request may produce the latter.
    consentData.consentFileData = body.consentFile.base64.includes(',')
      ? body.consentFile.base64.split(',').pop() || body.consentFile.base64
      : body.consentFile.base64;
    consentData.consentUploadedAt = new Date();
    consentData.consentUploadedById = userId;
  }
  if (body.consentForm) {
    consentData.consentFormData = JSON.stringify(body.consentForm);
    consentData.consentSignedElectronically = true;
    consentData.consentCompletedAt = new Date();
  }
  if (Object.keys(consentData).length > 0) {
    await prisma.surgery.update({ where: { id: surgeryId }, data: consentData });
    applied.push('consent');
  }

  // ── Consumables ─────────────────────────────────────────────────────────
  // Surgeon-added extras only. The mandatory base pack was attached when the
  // booking was created and must not be duplicated here, so this deletes only
  // the rows this endpoint could have written.
  if (body.consumableRequests) {
    await prisma.surgeryConsumableRequest.deleteMany({
      where: { surgeryId, requestedById: userId, notes: { not: BASE_PACK_LABEL } },
    });
    if (body.consumableRequests.length > 0) {
      await prisma.surgeryConsumableRequest.createMany({
        data: body.consumableRequests.map((c) => ({
          surgeryId,
          templateId: c.templateId || null,
          name: c.name,
          category: c.category as never,
          size: c.size ?? null,
          unit: c.unit,
          quantity: c.quantity,
          notes: c.notes ?? null,
          requestedById: userId,
          requestedByName: (session.user as { name?: string }).name ?? null,
        })),
      });
      await notify(
        'CONSUMABLE_PACK_PROVIDER',
        '🚨 EMERGENCY: consumable list updated',
        `Emergency ${booking.procedureName} for ${booking.patientName} — ${body.consumableRequests.length} item(s) to pack.`,
        '/dashboard/consumable-pack-provider',
      );
    }
    applied.push('consumables');
  }

  // ── Drugs and dressings ─────────────────────────────────────────────────
  if (body.drugDressingRequests) {
    await prisma.surgeryDrugDressingRequest.deleteMany({ where: { surgeryId } });
    if (body.drugDressingRequests.length > 0) {
      await prisma.surgeryDrugDressingRequest.createMany({
        data: body.drugDressingRequests.map((d) => ({
          surgeryId,
          templateId: d.templateId || null,
          name: d.name,
          type: d.type as never,
          dosage: d.dosage ?? null,
          route: d.route ?? null,
          quantity: d.quantity,
          unit: d.unit,
          notes: d.notes ?? null,
        })),
      });
      // Prescribed, not billed. Pharmacy is being told what this patient needs
      // so it can be packed — payment is never a condition of an emergency
      // going ahead, and this notification must never read as an invoice.
      await notify(
        'PHARMACIST',
        '🚨 EMERGENCY: prescription to pack',
        `Emergency ${booking.procedureName} for ${booking.patientName} — ${body.drugDressingRequests.length} item(s) to pack.`,
        `/dashboard/prescriptions?surgery=${surgeryId}`,
      );
    }
    applied.push('drugs');
  }

  return NextResponse.json({
    ok: true,
    applied,
    message: applied.length ? 'Saved.' : 'Nothing to save.',
  });
}

/** Tell a role that something is waiting for them. Never fatal. */
async function notify(role: string, title: string, message: string, link: string) {
  try {
    const users = await prisma.user.findMany({
      where: { role: role as never, status: 'APPROVED' },
      select: { id: true },
    });
    if (!users.length) return;
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: 'STOCK_ALERT' as never, title, message, link })),
    });
  } catch {
    // A failed bell must not lose the clinical record that caused it.
  }
}
