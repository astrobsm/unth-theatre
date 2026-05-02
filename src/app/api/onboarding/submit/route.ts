import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Must mirror the role list accepted by /api/users/bulk-upload
const VALID_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'THEATRE_STORE_KEEPER', 'PORTER', 'ANAESTHETIC_TECHNICIAN',
  'BIOMEDICAL_ENGINEER', 'CLEANER', 'PROCUREMENT_OFFICER',
];

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE    = /^(0\d{10}|\+234\d{10})$/;

function clean(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
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
    const staffCode   = clean(body.staffCode, 60);
    const staffId     = clean(body.staffId, 60);
    const title       = clean(body.title, 30);
    const notes       = clean(body.notes, 500);

    // Server-side validation (mirrors HTML constraints; never trust the client)
    const errors: string[] = [];
    if (!fullName) errors.push('Full Name is required');
    if (!username) errors.push('Username is required');
    else if (!USERNAME_RE.test(username))
      errors.push('Username must be 3–30 chars: lowercase letters, digits, dot or underscore');
    if (!role) errors.push('Role is required');
    else if (!VALID_ROLES.includes(role))
      errors.push(`Invalid role. Allowed: ${VALID_ROLES.join(', ')}`);
    if (email && !EMAIL_RE.test(email)) errors.push('Email format is invalid');
    if (phoneNumber && !PHONE_RE.test(phoneNumber))
      errors.push('Phone must be 11 digits starting with 0, or +234XXXXXXXXXX');

    if (errors.length) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
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
        ipAddress, userAgent,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        'Thank you! Your details have been recorded. ' +
        'The ORM administrator will activate your account shortly.',
      id: submission.id,
    });
  } catch (err: any) {
    console.error('Onboarding submit error:', err);
    return NextResponse.json(
      { error: 'Could not save submission', details: err.message },
      { status: 500 }
    );
  }
}
