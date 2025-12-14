import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { users } = await request.json();

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ error: 'Invalid data format. Expected array of users.' }, { status: 400 });
    }

    const results = {
      created: 0,
      errors: [] as any[],
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 2; // Excel rows start at 2 (after header)

      try {
        // Validate required fields
        if (!user.fullName || !user.username || !user.role) {
          results.errors.push({
            row: rowNumber,
            error: 'Missing required fields (Full Name, Username, Role)',
            data: user,
          });
          continue;
        }

        // Validate role
        const validRoles = [
          'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
          'SURGEON', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'ANAESTHETIST',
          'ANAESTHETIC_TECHNICIAN', 'CLEANER', 'PORTER', 'VIEWER'
        ];

        if (!validRoles.includes(user.role)) {
          results.errors.push({
            row: rowNumber,
            error: `Invalid role: ${user.role}. Must be one of: ${validRoles.join(', ')}`,
            data: user,
          });
          continue;
        }

        // Check if username already exists
        const existingUser = await prisma.user.findUnique({
          where: { username: user.username },
        });

        if (existingUser) {
          results.errors.push({
            row: rowNumber,
            error: `Username '${user.username}' already exists`,
            data: user,
          });
          continue;
        }

        // Check if email already exists (if provided)
        if (user.email) {
          const existingEmail = await prisma.user.findUnique({
            where: { email: user.email },
          });

          if (existingEmail) {
            results.errors.push({
              row: rowNumber,
              error: `Email '${user.email}' already exists`,
              data: user,
            });
            continue;
          }
        }

        // Check if staffCode already exists (if provided)
        if (user.staffCode) {
          const existingStaffCode = await prisma.user.findUnique({
            where: { staffCode: user.staffCode },
          });

          if (existingStaffCode) {
            results.errors.push({
              row: rowNumber,
              error: `Staff code '${user.staffCode}' already exists`,
              data: user,
            });
            continue;
          }
        }

        // Generate default password (username or custom)
        const defaultPassword = user.password || user.username;
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // Create user
        await prisma.user.create({
          data: {
            username: user.username,
            password: hashedPassword,
            fullName: user.fullName,
            email: user.email || null,
            role: user.role,
            phoneNumber: user.phoneNumber || null,
            department: user.department || null,
            staffCode: user.staffCode || null,
            staffId: user.staffId || null,
            status: 'APPROVED', // Auto-approve bulk uploaded users
            approvedBy: session.user.id,
            approvedAt: new Date(),
            isFirstLogin: true,
            mustChangePassword: true, // Force password change on first login
          },
        });

        results.created++;
      } catch (error: any) {
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error occurred',
          data: user,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully created ${results.created} user(s)`,
      created: results.created,
      errors: results.errors,
    });
  } catch (error: any) {
    console.error('Bulk upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk upload', details: error.message },
      { status: 500 }
    );
  }
}
