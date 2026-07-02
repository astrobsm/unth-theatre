import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
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
    // Staff now choose their own password during onboarding; the account is
    // activated (APPROVED) immediately so they can sign in right away.
    const password    = String(body.password ?? '');

    // House Officer rotation
    const rotationSpecialty = clean(body.rotationSpecialty, 60).toUpperCase();
    const rotationStartRaw  = clean(body.rotationStartDate, 30);
    const rotationEndRaw    = clean(body.rotationEndDate, 30);
    const rotationStartDate = rotationStartRaw ? new Date(rotationStartRaw) : null;
    const rotationEndDate   = rotationEndRaw   ? new Date(rotationEndRaw)   : null;

    const VALID_HO_SPECIALTIES = ['SURGERY', 'OBSTETRICS_GYNAECOLOGY', 'MAXILLOFACIAL', 'ENT'];

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
    if (!password || password.length < 6)
      errors.push('Password is required and must be at least 6 characters');

    if (role === 'HOUSE_OFFICER') {
      if (!rotationSpecialty || !VALID_HO_SPECIALTIES.includes(rotationSpecialty))
        errors.push('Rotation specialty is required for House Officers (Surgery, Obstetrics & Gynaecology, Maxillofacial or ENT)');
      if (!rotationStartDate || isNaN(rotationStartDate.getTime()))
        errors.push('Rotation start date is required for House Officers');
      if (!rotationEndDate || isNaN(rotationEndDate.getTime()))
        errors.push('Rotation end date is required for House Officers');
      if (rotationStartDate && rotationEndDate && rotationEndDate < rotationStartDate)
        errors.push('Rotation end date must be on or after the start date');
    }

    if (errors.length) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
    }

    // Reject duplicates up-front (case-insensitive username / email) so we
    // never create an un-loginnable account.
    const dupErrors: string[] = [];
    const existingUser = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) dupErrors.push('That username is already taken. Please choose another.');
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingEmail) dupErrors.push('That email is already registered.');
    }
    if (dupErrors.length) {
      return NextResponse.json({ error: 'Validation failed', details: dupErrors }, { status: 400 });
    }

    // Auto-generate the staff code from the role prefix when none was supplied
    if (!staffCode) {
      const prefix = prefixForRole(role);
      if (prefix) staffCode = await generateStaffCode(prefix);
    }

    // A supplied staff code that clashes with an existing user is dropped so it
    // can be regenerated below, avoiding a hard failure.
    if (staffCode) {
      const clash = await prisma.user.findUnique({ where: { staffCode }, select: { id: true } });
      if (clash) {
        const prefix = prefixForRole(role);
        staffCode = prefix ? await generateStaffCode(prefix) : '';
      }
    }

    // A staff ID that is already registered is left blank; the user can set it
    // on first login via the existing set-staff-id flow.
    let finalStaffId: string | null = staffId || null;
    if (finalStaffId) {
      const clashId = await prisma.user.findUnique({ where: { staffId: finalStaffId }, select: { id: true } });
      if (clashId) finalStaffId = null;
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
        staffId: finalStaffId,
        title: title || null,
        notes: notes || null,
        isContractStaff,
        ipAddress, userAgent,
        status: 'IMPORTED',
        importedAt: new Date(),
        rotationSpecialty: role === 'HOUSE_OFFICER' ? (rotationSpecialty || null) : null,
        rotationStartDate: role === 'HOUSE_OFFICER' ? rotationStartDate : null,
        rotationEndDate:   role === 'HOUSE_OFFICER' ? rotationEndDate   : null,
      },
    });

    // Create the account immediately with the staff-chosen password and
    // APPROVED status so they can sign in without waiting for an admin.
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        email: email || null,
        role: role as any,
        phoneNumber: phoneNumber || null,
        department: department || null,
        staffCode: staffCode || null,
        staffId: finalStaffId,
        status: 'APPROVED',
        approvedAt: new Date(),
        isFirstLogin: false,
        mustChangePassword: false,
        rotationSpecialty: role === 'HOUSE_OFFICER' ? (rotationSpecialty || null) : null,
        rotationStartDate: role === 'HOUSE_OFFICER' ? rotationStartDate : null,
        rotationEndDate:   role === 'HOUSE_OFFICER' ? rotationEndDate   : null,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        'Your account has been created and approved. ' +
        'You can now sign in with your username and password.',
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
