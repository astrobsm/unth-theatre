import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || !ADMIN_ROLES.includes((session as any).user.role)) {
    return null;
  }
  return session;
}

// GET /api/onboarding  -> list submissions (optionally filter by ?status=)
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status') ?? undefined;

  const submissions = await prisma.onboardingSubmission.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return NextResponse.json({ submissions });
}

// DELETE /api/onboarding?id=...   (admin removes a submission)
export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.onboardingSubmission.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
