import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { prefixForRole } from '@/lib/onboarding-roles';

export const dynamic = 'force-dynamic';

// GET /api/onboarding/staff-code?role=CLEANER  ->  { code: "CLN001" }
// Public endpoint: returns the next available staff code for the given role
// by scanning both `users.staffCode` and `onboarding_submissions.staffCode`
// for the highest existing numeric suffix matching the role's prefix.
export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get('role') || '';
  const prefix = prefixForRole(role);
  if (!prefix) {
    return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
  }

  // Find the largest numeric suffix in either table
  const pattern = `${prefix}%`;
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

  const all = [...userCodes, ...submissionCodes]
    .map(r => r.staffCode || '')
    .map(c => {
      const m = c.match(new RegExp(`^${prefix}(\\d+)$`));
      return m ? parseInt(m[1], 10) : 0;
    });

  const next = (all.length ? Math.max(...all) : 0) + 1;
  const code = `${prefix}${String(next).padStart(3, '0')}`;

  // Touch `pattern` so eslint doesn't complain in --strict mode (it's documentation)
  void pattern;

  return NextResponse.json({ code, prefix, next });
}
