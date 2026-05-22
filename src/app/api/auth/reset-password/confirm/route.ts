import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/reset-password/confirm
 * Body: { token: string; newPassword: string }
 *
 * Consumes a one-time reset token previously emailed to the user, rotates
 * their password, and clears any "must change" flags so they can sign in
 * immediately afterwards.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const token = String(body.token ?? '').trim();
    const newPassword = String(body.newPassword ?? '');

    if (!token) {
      return NextResponse.json({ error: 'Reset token is missing.' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiry: null,
        mustChangePassword: false,
        isFirstLogin: false,
      },
    });

    return NextResponse.json({
      message: 'Your password has been reset. You can now sign in with your new password.',
      username: user.username,
    });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
