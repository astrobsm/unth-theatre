import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { WARDS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

// GET — the combined, active ward list (built-in defaults + custom DB wards).
// `?admin=1` returns the full editable custom-ward records for the admin UI.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = request.nextUrl.searchParams.get('admin') === '1';
  try {
    const custom = await prisma.ward.findMany({ orderBy: { name: 'asc' } });
    if (admin) {
      return NextResponse.json({ wards: custom, defaults: WARDS });
    }
    // Merge defaults + active custom wards, de-duplicated, keeping "OTHERS" last.
    const set = new Set<string>();
    const list: string[] = [];
    for (const w of WARDS) {
      if (!set.has(w)) { set.add(w); list.push(w); }
    }
    for (const w of custom) {
      if (w.active && !set.has(w.name)) { set.add(w.name); list.push(w.name); }
    }
    // Keep the catch-all option at the very end.
    const others = 'OTHERS (SPECIFY)';
    const ordered = [...list.filter((w) => w !== others), ...(set.has(others) ? [others] : [])];
    return NextResponse.json({ wards: ordered });
  } catch (e: any) {
    // Table may not exist yet on prod — degrade gracefully to the defaults.
    return NextResponse.json({ wards: [...WARDS] });
  }
}

// POST — create a custom ward. Body: { name }
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let body: { name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const name = (body.name || '').trim().toUpperCase();
  if (name.length < 2) return NextResponse.json({ error: 'Ward name is required' }, { status: 400 });
  if ((WARDS as readonly string[]).includes(name)) {
    return NextResponse.json({ error: 'That ward already exists in the built-in list.' }, { status: 400 });
  }
  try {
    const existing = await prisma.ward.findUnique({ where: { name } });
    if (existing) return NextResponse.json({ error: 'That ward already exists.' }, { status: 400 });
    const ward = await prisma.ward.create({ data: { name } });
    return NextResponse.json(ward, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PATCH — rename or activate/deactivate a custom ward. Body: { id, name?, active? }
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let body: { id?: string; name?: string; active?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const data: { name?: string; active?: boolean } = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim().toUpperCase();
    if (name.length < 2) return NextResponse.json({ error: 'Ward name is required' }, { status: 400 });
    data.name = name;
  }
  if (typeof body.active === 'boolean') data.active = body.active;
  try {
    const ward = await prisma.ward.update({ where: { id: body.id }, data });
    return NextResponse.json(ward);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
