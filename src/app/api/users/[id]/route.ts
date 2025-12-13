import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateUserSchema = z.object({
  staffCode: z.string().optional().nullable(),
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

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: {
        staffCode: validatedData.staffCode || null,
      },
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
    console.error("User update error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
