import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { validateUsername, normaliseUsername } from "@/lib/usernameRules";

export const dynamic = 'force-dynamic';

const ROLE_VALUES = Object.values(UserRole) as [string, ...string[]];

const updateUserSchema = z.object({
  // A LOGIN CREDENTIAL, not a profile field. The rule lives in
  // @/lib/usernameRules so the browser and this route cannot disagree about
  // what is acceptable.
  username: z.string()
    .transform(normaliseUsername)
    .superRefine((v, ctx) => {
      const problem = validateUsername(v);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    })
    .optional(),
  staffCode: z.string().optional().nullable(),
  role: z.enum(ROLE_VALUES).optional(),
  fullName: z.string().trim().min(2).optional(),
  phoneNumber: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  department: z.string().trim().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "THEATRE_MANAGER")) {
      return NextResponse.json(
        { error: "Unauthorized. Admin or Theatre Manager access required." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);

    // Role change rules: only ADMIN can change roles; cannot change own role
    if (validatedData.role !== undefined) {
      if (session.user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Only ADMIN can change user roles." },
          { status: 403 }
        );
      }
      if (session.user.id === params.id) {
        return NextResponse.json(
          { error: "You cannot change your own role." },
          { status: 403 }
        );
      }
    }

    // Changing a username changes how somebody signs in. It sits with the role
    // change above rather than with phone and department: a THEATRE_MANAGER may
    // correct a misspelt name, but only an ADMIN may alter a credential.
    let previousUsername: string | null = null;
    if (validatedData.username !== undefined) {
      if (session.user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Only ADMIN can change a username." },
          { status: 403 }
        );
      }

      const target = await prisma.user.findUnique({
        where: { id: params.id },
        select: { username: true },
      });
      if (!target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      previousUsername = target.username;

      // CASE-INSENSITIVELY unique, because that is how sign-in resolves it
      // (findByUsername in @/lib/auth uses mode: "insensitive"). The database
      // constraint is case-SENSITIVE, so it would happily accept "Tonia"
      // alongside an existing "tonia" — and then two accounts answer to one
      // login and whichever is found first wins. Checking it here is the only
      // thing standing between that and somebody signing into the wrong record.
      const clash = await prisma.user.findFirst({
        where: {
          username: { equals: validatedData.username, mode: 'insensitive' },
          NOT: { id: params.id },
        },
        select: { id: true, username: true, fullName: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: `That username is already used by ${clash.fullName} (${clash.username}).` },
          { status: 400 }
        );
      }
    }

    // Check if staffCode is being set and if it's already in use
    if (validatedData.staffCode) {
      const existingUser = await prisma.user.findUnique({
        where: { staffCode: validatedData.staffCode },
      });

      if (existingUser && existingUser.id !== params.id) {
        return NextResponse.json(
          { error: "Staff code is already assigned to another user" },
          { status: 400 }
        );
      }
    }

    const data: {
      username?: string;
      staffCode?: string | null;
      role?: UserRole;
      fullName?: string;
      phoneNumber?: string | null;
      email?: string | null;
      department?: string | null;
    } = {};
    if (validatedData.username !== undefined) data.username = validatedData.username;
    if (body.staffCode !== undefined) {
      data.staffCode = validatedData.staffCode || null;
    }
    if (validatedData.role !== undefined) {
      data.role = validatedData.role as UserRole;
    }
    // Editable profile fields (name, phone, email, department).
    if (validatedData.fullName !== undefined) data.fullName = validatedData.fullName;
    if (body.phoneNumber !== undefined) data.phoneNumber = validatedData.phoneNumber || null;
    if (body.email !== undefined) data.email = validatedData.email || null;
    if (body.department !== undefined) data.department = validatedData.department || null;

    // Guard against email collisions with another user.
    if (data.email) {
      const clash = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: params.id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: "That email is already used by another user." },
          { status: 400 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        staffCode: true,
        phoneNumber: true,
        email: true,
        department: true,
      },
    });

    if (previousUsername && previousUsername !== updatedUser.username) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'USER_USERNAME_CHANGED',
          tableName: 'users',
          recordId: params.id,
          changes: JSON.stringify({
            from: previousUsername,
            to: updatedUser.username,
            subject: updatedUser.fullName,
          }),
        },
        // An audit failure must not roll back a change the admin has been told
        // succeeded; it is logged instead of swallowed silently.
      }).catch((e) => console.error('[users] username change audit failed:', e));
    }

    return NextResponse.json(updatedUser, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    console.error("User update error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
