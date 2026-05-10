import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/users/set-staff-id
 * Body: { staffId: string }
 *
 * Used by the first-login flow so porters / cleaners (and any other newly
 * onboarded staff) can record their official hospital Staff ID the first
 * time they sign in. Once set, the value cannot be changed via this
 * endpoint (an admin must edit the user record instead). The current
 * caller is identified by their NextAuth session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const raw = typeof body?.staffId === 'string' ? body.staffId.trim() : '';

    if (!raw) {
      return NextResponse.json(
        { error: 'Staff ID is required' },
        { status: 400 }
      );
    }
    if (raw.length > 60) {
      return NextResponse.json(
        { error: 'Staff ID is too long (max 60 characters)' },
        { status: 400 }
      );
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, staffId: true },
    });
    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (me.staffId && me.staffId.trim() !== '') {
      return NextResponse.json(
        { error: 'Staff ID has already been set. Contact an administrator to change it.' },
        { status: 409 }
      );
    }

    // Reject duplicates (Prisma unique constraint will also enforce this)
    const clash = await prisma.user.findFirst({
      where: { staffId: raw, NOT: { id: me.id } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: 'That Staff ID is already in use. Please double-check the number on your hospital ID card.' },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id: me.id },
      data: { staffId: raw, isFirstLogin: false },
    });

    return NextResponse.json({ success: true, staffId: raw });
  } catch (err: any) {
    console.error('set-staff-id failed:', err);
    return NextResponse.json(
      { error: 'Failed to save Staff ID', details: err?.message },
      { status: 500 }
    );
  }
}
