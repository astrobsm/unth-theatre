import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { ROLE_VALUES } from '@/lib/onboarding-roles';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

const VALID_ROLES = ROLE_VALUES;

// POST /api/onboarding/import   body: { ids?: string[] }   (omit ids => all PENDING)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !ADMIN_ROLES.includes((session as any).user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body.ids) ? body.ids : undefined;

  const submissions = await prisma.onboardingSubmission.findMany({
    where: { status: 'PENDING', ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' },
  });

  if (submissions.length === 0) {
    return NextResponse.json({
      success: true, created: 0, errors: [],
      message: 'No pending submissions to import.',
    });
  }

  const created: { id: string; username: string }[] = [];
  const errors: { id: string; row: number; username: string; error: string }[] = [];

  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i];
    const rowNumber = i + 1;
    try {
      if (!s.fullName || !s.username || !s.role) {
        throw new Error('Missing required fields (Full Name, Username, Role)');
      }
      if (!VALID_ROLES.includes(s.role)) {
        throw new Error(`Invalid role: ${s.role}`);
      }

      const existingUser = await prisma.user.findUnique({ where: { username: s.username } });
      if (existingUser) throw new Error(`Username '${s.username}' already exists`);

      if (s.email) {
        const existingEmail = await prisma.user.findUnique({ where: { email: s.email } });
        if (existingEmail) throw new Error(`Email '${s.email}' already exists`);
      }

      if (s.staffCode) {
        const existingStaffCode = await prisma.user.findUnique({ where: { staffCode: s.staffCode } });
        if (existingStaffCode) throw new Error(`Staff code '${s.staffCode}' already exists`);
      }

      const defaultPassword = s.username; // user must change on first login
      const hashed = await bcrypt.hash(defaultPassword, 10);

      await prisma.user.create({
        data: {
          username: s.username,
          password: hashed,
          fullName: s.fullName,
          email: s.email || null,
          role: s.role as any,
          phoneNumber: s.phoneNumber || null,
          department: s.department || null,
          staffCode: s.staffCode || null,
          staffId: s.staffId || null,
          status: 'APPROVED',
          approvedBy: (session as any).user.id,
          approvedAt: new Date(),
          isFirstLogin: true,
          mustChangePassword: true,
        },
      });

      await prisma.onboardingSubmission.update({
        where: { id: s.id },
        data: {
          status: 'IMPORTED',
          importedAt: new Date(),
          importedBy: (session as any).user.id,
          importError: null,
        },
      });

      created.push({ id: s.id, username: s.username });
    } catch (err: any) {
      const message = err?.message ?? 'Unknown error';
      errors.push({ id: s.id, row: rowNumber, username: s.username, error: message });
      try {
        await prisma.onboardingSubmission.update({
          where: { id: s.id },
          data: { importError: message },
        });
      } catch (_) { /* ignore secondary failure */ }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Imported ${created.length} of ${submissions.length} submission(s).`,
    created: created.length,
    createdUsernames: created.map(c => c.username),
    errors,
  });
}
