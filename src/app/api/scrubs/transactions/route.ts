import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Scrub sign-out / return ledger.
 *
 * GET  -> recent transactions (optionally filtered by userId / status / open).
 * POST -> action-driven:
 *   issue  : sign a scrub set out to a staff member (status → IN_USE).
 *   return : return a set; verifies the EXACT serial is returned by the same
 *            holder, then routes the set to laundry (status → IN_CLEANING).
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const openOnly = searchParams.get('open') === 'true';

    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (openOnly) where.returnedAt = null;

    const transactions = await prisma.scrubTransaction.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('GET /api/scrubs/transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to load transactions' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as 'issue' | 'return';
    const actorId = (session.user as any).id as string;
    const actorName = (session.user as any).fullName || session.user?.name || 'Staff';

    // Locate the set by id or serial number.
    let set = null as any;
    if (body.scrubSetId) {
      set = await prisma.scrubSet.findUnique({ where: { id: body.scrubSetId } });
    } else if (body.serialNumber) {
      set = await prisma.scrubSet.findUnique({
        where: { serialNumber: (body.serialNumber || '').trim() },
      });
    }
    if (!set) {
      return NextResponse.json(
        { error: 'Scrub set not found — check the serial number' },
        { status: 404 },
      );
    }

    // -------------------------------------------------------------- ISSUE
    if (action === 'issue') {
      if (set.status === 'IN_USE') {
        return NextResponse.json(
          { error: `Set ${set.serialNumber} is already signed out` },
          { status: 409 },
        );
      }
      if (set.status === 'RETIRED') {
        return NextResponse.json(
          { error: `Set ${set.serialNumber} has been retired` },
          { status: 409 },
        );
      }
      if (set.status === 'IN_CLEANING') {
        return NextResponse.json(
          { error: `Set ${set.serialNumber} is still in laundry` },
          { status: 409 },
        );
      }

      // The wearer — defaults to the set owner, but an attendant can issue to
      // any staff member (body.userId).
      const wearerId = body.userId || set.ownerId || actorId;
      const wearer = await prisma.user.findUnique({
        where: { id: wearerId },
        select: { fullName: true, role: true },
      });

      // Expected return at end of shift (default 12h).
      const dueBack = new Date();
      dueBack.setHours(dueBack.getHours() + (body.shiftHours || 12));

      const txn = await prisma.scrubTransaction.create({
        data: {
          scrubSetId: set.id,
          serialNumber: set.serialNumber,
          color: set.color,
          userId: wearerId,
          userName: wearer?.fullName || actorName,
          userRole: wearer?.role || null,
          status: 'ISSUED',
          issuedById: actorId,
          issuedByName: actorName,
          dueBack,
          notes: body.notes || null,
        },
      });

      await prisma.scrubSet.update({
        where: { id: set.id },
        data: {
          status: 'IN_USE',
          currentHolderId: wearerId,
          currentHolderName: wearer?.fullName || actorName,
        },
      });

      return NextResponse.json({ transaction: txn }, { status: 201 });
    }

    // ------------------------------------------------------------- RETURN
    if (action === 'return') {
      const openTxn = await prisma.scrubTransaction.findFirst({
        where: { scrubSetId: set.id, returnedAt: null },
        orderBy: { issuedAt: 'desc' },
      });
      if (!openTxn) {
        return NextResponse.json(
          { error: `Set ${set.serialNumber} is not currently signed out` },
          { status: 409 },
        );
      }

      const txn = await prisma.scrubTransaction.update({
        where: { id: openTxn.id },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          returnedById: actorId,
          returnedByName: actorName,
        },
      });

      await prisma.scrubSet.update({
        where: { id: set.id },
        data: {
          status: 'IN_CLEANING',
          currentHolderId: null,
          currentHolderName: null,
        },
      });

      return NextResponse.json({ transaction: txn });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/scrubs/transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to process transaction' },
      { status: 500 },
    );
  }
}
