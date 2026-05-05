import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role  = searchParams.get('role');
    const roles = searchParams.get('roles'); // comma-separated, e.g. "SURGEON,HOUSE_OFFICER"
    const status = searchParams.get('status');
    const q = (searchParams.get('q') || '').trim();
    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : undefined;

    // Build filter
    const where: Record<string, unknown> = {};
    if (roles) {
      const list = roles.split(',').map(r => r.trim()).filter(Boolean);
      if (list.length === 1) where.role = list[0];
      else if (list.length > 1) where.role = { in: list };
    } else if (role) {
      where.role = role;
    }
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { fullName:  { contains: q, mode: 'insensitive' } },
        { username:  { contains: q, mode: 'insensitive' } },
        { staffCode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        staffCode: true,
        phoneNumber: true,
        department: true,
        rotationSpecialty: true,
        createdAt: true,
        approvedBy: true,
        approvedAt: true,
      },
      orderBy: { fullName: 'asc' },
      ...(limit ? { take: limit } : {}),
    });

    return NextResponse.json(users);

  } catch (error) {
    console.error("Users fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
