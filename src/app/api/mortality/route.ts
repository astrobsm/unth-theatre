import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const mortalitySchema = z.object({
  surgeryId: z.string(),
  patientId: z.string(),
  timeOfDeath: z.string(),
  location: z.enum(['PREOPERATIVE', 'INTRAOPERATIVE', 'POSTOPERATIVE_RECOVERY', 'POSTOPERATIVE_WARD']),
  causeOfDeath: z.string(),
  contributingFactors: z.string().optional(),
  resuscitationAttempted: z.boolean(),
  resuscitationDetails: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const where = id ? { id } : {};

    const mortalities = await prisma.mortality.findMany({
      where,
      include: {
        patient: {
          select: {
            name: true,
            folderNumber: true,
            age: true,
            gender: true,
          }
        },
        surgery: {
          include: {
            surgeon: {
              select: {
                fullName: true,
              }
            }
          }
        },
        audit: {
          select: {
            id: true,
            auditDate: true,
            findings: true,
            preventability: true,
            recommendations: true,
            followUpRequired: true,
            completedAt: true,
          }
        }
      },
      orderBy: { timeOfDeath: 'desc' }
    });

    return NextResponse.json(mortalities);

  } catch (error) {
    console.error("Failed to fetch mortalities:", error);
    return NextResponse.json(
      { error: "Failed to fetch mortalities" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = mortalitySchema.parse(body);

    const mortality = await prisma.mortality.create({
      data: {
        ...validatedData,
        reportedBy: session.user.id,
      },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: true,
          }
        }
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'Mortality',
        recordId: mortality.id,
        changes: `Mortality recorded for patient ${validatedData.patientId}`,
      }
    });

    return NextResponse.json(mortality, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to create mortality record:", error);
    return NextResponse.json(
      { error: "Failed to create mortality record" },
      { status: 500 }
    );
  }
}
