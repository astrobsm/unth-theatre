import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const auditSchema = z.object({
  mortalityId: z.string(),
  findings: z.string(),
  preventability: z.enum(['PREVENTABLE', 'POSSIBLY_PREVENTABLE', 'NOT_PREVENTABLE']),
  recommendations: z.string(),
  actionsTaken: z.string().optional().nullable(),
  followUpRequired: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = auditSchema.parse(body);

    const audit = await prisma.mortalityAudit.create({
      data: {
        ...validatedData,
        reviewedBy: session.user.id,
      },
      include: {
        mortality: {
          include: {
            patient: true,
            surgery: true,
          }
        }
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'MortalityAudit',
        recordId: audit.id,
        changes: `Mortality audit completed for case ${validatedData.mortalityId}`,
      }
    });

    return NextResponse.json(audit, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to create mortality audit:", error);
    return NextResponse.json(
      { error: "Failed to create mortality audit" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mortalityId = searchParams.get('mortalityId');

    const where = mortalityId ? { mortalityId } : {};

    const audits = await prisma.mortalityAudit.findMany({
      where,
      include: {
        mortality: {
          include: {
            patient: true,
            surgery: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(audits);

  } catch (error) {
    console.error("Failed to fetch mortality audits:", error);
    return NextResponse.json(
      { error: "Failed to fetch mortality audits" },
      { status: 500 }
    );
  }
}
