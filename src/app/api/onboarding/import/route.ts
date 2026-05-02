import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { ROLE_VALUES, prefixForRole } from '@/lib/onboarding-roles';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

const VALID_ROLES = ROLE_VALUES;

// Reserve the next free staff code for the given role prefix.
// Scans both User.staffCode and OnboardingSubmission.staffCode so we never collide.
async function nextFreeStaffCode(prefix: string): Promise<string> {
  const [userCodes, submissionCodes] = await Promise.all([
    prisma.user.findMany({
      where: { staffCode: { startsWith: prefix } },
      select: { staffCode: true },
    }),
    prisma.onboardingSubmission.findMany({
      where: { staffCode: { startsWith: prefix } },
      select: { staffCode: true },
    }),
  ]);
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const used = new Set<number>();
  for (const r of [...userCodes, ...submissionCodes]) {
    const m = (r.staffCode || '').match(re);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

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

  const created: { id: string; username: string; staffCode: string | null; notes: string[] }[] = [];
  const errors: { id: string; row: number; username: string; error: string }[] = [];

  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i];
    const rowNumber = i + 1;
    const notes: string[] = [];
    try {
      if (!s.fullName || !s.username || !s.role) {
        throw new Error('Missing required fields (Full Name, Username, Role)');
      }
      if (!VALID_ROLES.includes(s.role)) {
        throw new Error(`Invalid role: ${s.role}`);
      }

      // Username MUST be unique — this is the login key, no auto-rewrite
      const existingUser = await prisma.user.findUnique({ where: { username: s.username } });
      if (existingUser) throw new Error(`Username '${s.username}' already exists`);

      // Email conflict → drop the email rather than fail the whole import
      let importEmail: string | null = s.email || null;
      if (importEmail) {
        const existingEmail = await prisma.user.findUnique({ where: { email: importEmail } });
        if (existingEmail) {
          notes.push(`Email '${importEmail}' already in use — imported without email.`);
          importEmail = null;
        }
      }

      // Staff code: auto-(re)assign if missing OR if it collides with an existing user
      let importStaffCode: string | null = s.staffCode || null;
      const prefix = prefixForRole(s.role);
      if (importStaffCode) {
        const clash = await prisma.user.findUnique({ where: { staffCode: importStaffCode } });
        if (clash) {
          if (!prefix) {
            throw new Error(
              `Staff code '${importStaffCode}' already exists and role has no prefix to auto-reassign.`
            );
          }
          const reassigned = await nextFreeStaffCode(prefix);
          notes.push(`Staff code '${importStaffCode}' was taken — reassigned to '${reassigned}'.`);
          importStaffCode = reassigned;
        }
      } else if (prefix) {
        importStaffCode = await nextFreeStaffCode(prefix);
        notes.push(`Auto-assigned staff code '${importStaffCode}'.`);
      }

      const defaultPassword = s.username; // user must change on first login
      const hashed = await bcrypt.hash(defaultPassword, 10);

      await prisma.user.create({
        data: {
          username: s.username,
          password: hashed,
          fullName: s.fullName,
          email: importEmail,
          role: s.role as any,
          phoneNumber: s.phoneNumber || null,
          department: s.department || null,
          staffCode: importStaffCode,
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
          // keep any non-fatal notes visible in the admin panel
          importError: notes.length ? notes.join(' ') : null,
          // record the final code we actually used
          staffCode: importStaffCode,
        },
      });

      created.push({ id: s.id, username: s.username, staffCode: importStaffCode, notes });
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
    createdDetails: created,
    errors,
  });
}
