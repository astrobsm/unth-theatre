import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { UserRole } from "@prisma/client";

export const dynamic = 'force-dynamic';

const ROLE_VALUES = Object.values(UserRole) as [string, ...string[]];

const updateUserSchema = z.object({
  staffCode: z.string().optional().nullable(),
  role: z.enum(ROLE_VALUES).optional(),
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

    const data: { staffCode?: string | null; role?: UserRole } = {};
    if (body.staffCode !== undefined) {
      data.staffCode = validatedData.staffCode || null;
    }
    if (validatedData.role !== undefined) {
      data.role = validatedData.role as UserRole;
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
      },
    });

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
