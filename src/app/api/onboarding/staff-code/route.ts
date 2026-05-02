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

  try {
    // Either query may fail (e.g. before migrations are deployed); collect what we can
    const [userResult, submissionResult] = await Promise.allSettled([
      prisma.user.findMany({
        where: { staffCode: { startsWith: prefix } },
        select: { staffCode: true },
      }),
      prisma.onboardingSubmission.findMany({
        where: { staffCode: { startsWith: prefix } },
        select: { staffCode: true },
      }),
    ]);

    const userCodes = userResult.status === 'fulfilled' ? userResult.value : [];
    const submissionCodes =
      submissionResult.status === 'fulfilled' ? submissionResult.value : [];

    if (userResult.status === 'rejected') {
      console.warn('staff-code: user query failed', userResult.reason?.message);
    }
    if (submissionResult.status === 'rejected') {
      console.warn(
        'staff-code: submission query failed (table may not exist yet)',
        submissionResult.reason?.message
      );
    }

    const re = new RegExp(`^${prefix}(\\d+)$`);
    const numbers = [...userCodes, ...submissionCodes]
      .map(r => (r.staffCode || '').match(re))
      .map(m => (m ? parseInt(m[1], 10) : 0));

    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const code = `${prefix}${String(next).padStart(3, '0')}`;

    return NextResponse.json({ code, prefix, next });
  } catch (err: any) {
    console.error('staff-code endpoint failed:', err);
    // Last-resort fallback so the form still gets a usable code
    return NextResponse.json({
      code: `${prefix}001`,
      prefix,
      next: 1,
      warning: 'fallback (database lookup failed)',
    });
  }
}

