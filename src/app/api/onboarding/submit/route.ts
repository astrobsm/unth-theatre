import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ROLE_VALUES, prefixForRole } from '@/lib/onboarding-roles';

export const dynamic = 'force-dynamic';

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE    = /^(0\d{10}|\+234\d{10})$/;

function clean(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
}

async function generateStaffCode(prefix: string): Promise<string> {
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
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const numbers = [...userCodes, ...submissionCodes]
    .map(r => (r.staffCode || '').match(re))
    .map(m => (m ? parseInt(m[1], 10) : 0));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const fullName    = clean(body.fullName, 120);
    const username    = clean(body.username, 30).toLowerCase();
    const email       = clean(body.email, 160);
    const role        = clean(body.role, 60).toUpperCase();
    const phoneNumber = clean(body.phoneNumber, 20);
    const department  = clean(body.department, 120);
    let   staffCode   = clean(body.staffCode, 60).toUpperCase();
    const staffId     = clean(body.staffId, 60);
    const title       = clean(body.title, 30);
    const notes       = clean(body.notes, 500);
    const isContractStaff = body.isContractStaff === true;

    // Server-side validation (mirrors HTML constraints; never trust the client)
    const errors: string[] = [];
    if (!fullName) errors.push('Full Name is required');
    if (!username) errors.push('Username is required');
    else if (!USERNAME_RE.test(username))
      errors.push('Username must be 3–30 chars: lowercase letters, digits, dot or underscore');
    if (!role) errors.push('Role is required');
    else if (!ROLE_VALUES.includes(role))
      errors.push('Invalid role.');
    if (email && !EMAIL_RE.test(email)) errors.push('Email format is invalid');
    if (phoneNumber && !PHONE_RE.test(phoneNumber))
      errors.push('Phone must be 11 digits starting with 0, or +234XXXXXXXXXX');
    if (!isContractStaff && !staffId)
      errors.push('Staff ID is required (tick "Contract staff" if you do not have one)');

    if (errors.length) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
    }

    // Auto-generate the staff code from the role prefix when none was supplied
    if (!staffCode) {
      const prefix = prefixForRole(role);
      if (prefix) staffCode = await generateStaffCode(prefix);
    }

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent')?.slice(0, 250) || null;

    const submission = await prisma.onboardingSubmission.create({
      data: {
        fullName, username, email: email || null, role,
        phoneNumber: phoneNumber || null,
        department: department || null,
        staffCode: staffCode || null,
        staffId: staffId || null,
        title: title || null,
        notes: notes || null,
        isContractStaff,
        ipAddress, userAgent,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        'Thank you! Your details have been recorded. ' +
        'The ORM administrator will activate your account shortly.',
      id: submission.id,
      staffCode: submission.staffCode,
    });
  } catch (err: any) {
    console.error('Onboarding submit error:', err);
    return NextResponse.json(
      { error: 'Could not save submission', details: err.message },
      { status: 500 }
    );
  }
}
