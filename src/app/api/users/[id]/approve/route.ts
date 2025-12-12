import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'THEATRE_MANAGER')) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        status: 'APPROVED',
        approvedBy: session.user.id,
        approvedAt: new Date(),
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'APPROVE_USER',
        tableName: 'users',
        recordId: user.id,
        changes: JSON.stringify({ status: 'APPROVED' }),
      }
    });

    return NextResponse.json(user);

  } catch (error) {
    console.error("User approval error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
