import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contacts?type=patient&id=...   (or &name=...)
 * GET /api/contacts?type=user&id=...      (or &name=...)
 *
 * Returns the phone contact details for a patient or user so any clickable
 * name in the app can surface "who to call" information.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id')?.trim();
  const name = searchParams.get('name')?.trim();

  if (!id && !name) {
    return NextResponse.json({ error: 'Provide id or name' }, { status: 400 });
  }

  try {
    if (type === 'patient') {
      const patient = id
        ? await prisma.patient.findUnique({ where: { id } })
        : await prisma.patient.findFirst({
            where: { name: { equals: name!, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
          });

      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      return NextResponse.json({
        type: 'patient',
        id: patient.id,
        name: patient.name,
        folderNumber: patient.folderNumber,
        ward: patient.ward,
        contacts: [
          patient.phoneNumber && { label: 'Patient', name: patient.name, phone: patient.phoneNumber },
          patient.caregiverPhone && {
            label: 'Caregiver',
            name: patient.caregiverName || 'Caregiver',
            phone: patient.caregiverPhone,
          },
        ].filter(Boolean),
      });
    }

    if (type === 'user') {
      const user = id
        ? await prisma.user.findUnique({ where: { id } })
        : await prisma.user.findFirst({
            where: { fullName: { equals: name!, mode: 'insensitive' } },
          });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        type: 'user',
        id: user.id,
        name: user.fullName,
        role: user.role,
        department: user.department,
        contacts: [
          user.phoneNumber && { label: 'Staff', name: user.fullName, phone: user.phoneNumber },
        ].filter(Boolean),
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Contacts lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
