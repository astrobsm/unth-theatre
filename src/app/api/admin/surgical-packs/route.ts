import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Who may author packs. Pharmacists curate pharmacy packs; pack providers and
// theatre admins curate consumable packs.
const ADMIN_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'PHARMACIST',
  'CONSUMABLE_PACK_PROVIDER',
];

function forbidden(role?: string) {
  return !role || !ADMIN_ROLES.includes(role);
}

const itemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().default('piece'),
  category: z.string().nullish(),
  size: z.string().nullish(),
  drugType: z.string().nullish(),
  dosage: z.string().nullish(),
  route: z.string().nullish(),
  notes: z.string().nullish(),
});

const packSchema = z.object({
  name: z.string().min(2),
  subspecialty: z.string().min(2),
  kind: z.enum(['CONSUMABLE', 'PHARMACY']),
  description: z.string().nullish(),
  isActive: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  items: z.array(itemSchema).default([]),
});

// GET /api/admin/surgical-packs — full list incl. drafts, with items.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (forbidden((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const packs = await prisma.surgicalPack.findMany({
    orderBy: [{ subspecialty: 'asc' }, { kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  return NextResponse.json({ packs });
}

// POST /api/admin/surgical-packs — create a pack with its items.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (forbidden((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = packSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const pack = await prisma.surgicalPack.create({
    data: {
      name: d.name,
      subspecialty: d.subspecialty,
      kind: d.kind,
      description: d.description ?? null,
      isActive: d.isActive,
      sortOrder: d.sortOrder,
      createdById: (session!.user as any).id ?? null,
      createdByName: (session!.user as any).fullName || (session!.user as any).name || null,
      items: {
        create: d.items.map((it, i) => ({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          category: it.category ?? null,
          size: it.size ?? null,
          drugType: it.drugType ?? null,
          dosage: it.dosage ?? null,
          route: it.route ?? null,
          notes: it.notes ?? null,
          sortOrder: i,
        })),
      },
    },
    include: { items: true },
  });
  return NextResponse.json({ pack }, { status: 201 });
}

// PATCH /api/admin/surgical-packs — update a pack; if `items` is supplied it
// replaces the pack's items wholesale (simplest correct semantics for editing).
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (forbidden((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const parsed = packSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.surgicalPack.update({
      where: { id },
      data: {
        name: d.name,
        subspecialty: d.subspecialty,
        kind: d.kind,
        description: d.description ?? undefined,
        isActive: d.isActive,
        sortOrder: d.sortOrder,
      },
    });
    if (d.items) {
      await tx.surgicalPackItem.deleteMany({ where: { packId: id } });
      await tx.surgicalPackItem.createMany({
        data: d.items.map((it, i) => ({
          packId: id,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          category: it.category ?? null,
          size: it.size ?? null,
          drugType: it.drugType ?? null,
          dosage: it.dosage ?? null,
          route: it.route ?? null,
          notes: it.notes ?? null,
          sortOrder: i,
        })),
      });
    }
  });

  const pack = await prisma.surgicalPack.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  return NextResponse.json({ pack });
}

// DELETE /api/admin/surgical-packs?id=...  (items cascade)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (forbidden((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.surgicalPack.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
