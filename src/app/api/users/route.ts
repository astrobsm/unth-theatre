import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";

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
      ? Math.min(limitParam, 1000)
      : undefined;

    // Build filter
    //
    // ROLE VALUES ARE CHECKED AGAINST THE ENUM BEFORE THEY REACH PRISMA.
    //
    // They used to be passed through verbatim, so a request for a role that
    // does not exist did not return "no such people" — it threw, and the whole
    // listing became a 500:
    //
    //     Invalid value for argument `role`. Expected UserRole.
    //
    // Sixteen of those on 19 August alone, all asking for CIRCULATING_NURSE or
    // NURSE. Neither is a UserRole; the nursing roles here are SCRUB_NURSE and
    // RECOVERY_ROOM_NURSE. Both names appear all over the codebase in
    // permission allow-lists, where a role that matches nobody is harmless —
    // which is exactly how they survived long enough to be typed into a query.
    //
    // An unknown role now yields an empty result, because that is the true
    // answer: no user holds a role that does not exist. A read endpoint should
    // never fail on the CONTENT of a query parameter — the caller asked a
    // well-formed question and deserves an answer rather than a stack trace.
    // The unknown name is logged so the caller can be found and corrected.
    const validRoles = new Set(Object.values(UserRole) as string[]);
    const keepValid = (list: string[]) => {
      const unknown = list.filter((r) => !validRoles.has(r));
      if (unknown.length) {
        console.warn(`[users] ignoring unknown role filter: ${unknown.join(', ')}`);
      }
      return list.filter((r) => validRoles.has(r));
    };

    const where: Record<string, unknown> = {};
    const requested = roles
      ? roles.split(',').map((r) => r.trim()).filter(Boolean)
      : role
        ? [role]
        : [];

    if (requested.length) {
      const valid = keepValid(requested);
      // Every requested role was unknown. `in: []` matches nothing, which is
      // the correct answer and keeps the response shape identical.
      where.role = valid.length === 1 ? valid[0] : { in: valid };
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
