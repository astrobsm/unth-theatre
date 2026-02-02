import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const surgerySchema = z.object({
  patientId: z.string(),
  surgeonName: z.string(),
  unit: z.string(),
  subspecialty: z.string(),
  indication: z.string(),
  procedureName: z.string(),
  scheduledDate: z.string(),
  scheduledTime: z.string(),
  surgeryType: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']).default('ELECTIVE'),
  needBloodTransfusion: z.boolean().default(false),
  needDiathermy: z.boolean().default(false),
  needStereo: z.boolean().default(false),
  needMontrellMattress: z.boolean().default(false),
  otherSpecialNeeds: z.string().optional(),
  teamMembers: z.array(z.object({
    name: z.string(),
    role: z.enum(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER']),
  })).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const surgeries = await prisma.surgery.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            folderNumber: true,
            ptNumber: true,
            age: true,
            gender: true,
          }
        },
        surgeon: {
          select: {
            fullName: true,
          }
        }
      },
      orderBy: { scheduledDate: 'desc' }
    });

    return NextResponse.json(surgeries);

  } catch (error) {
    console.error("Surgeries fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = surgerySchema.parse(body);

    const { teamMembers, surgeryType, ...surgeryData } = validatedData;

    // Get patient details for emergency alert
    const patient = await prisma.patient.findUnique({
      where: { id: validatedData.patientId }
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const surgery = await prisma.surgery.create({
      data: {
        ...surgeryData,
        surgeonName: validatedData.surgeonName,
        surgeonId: null, // No user ID when entering name directly
        surgeryType: surgeryType,
        scheduledDate: new Date(validatedData.scheduledDate),
        // Create team members if provided
        teamMembers: teamMembers && teamMembers.length > 0 ? {
          create: teamMembers.map(tm => ({
            memberName: tm.name,
            userId: null, // No user ID when entering name directly
            role: tm.role,
          }))
        } : undefined,
      },
      include: {
        patient: true,
        surgeon: true,
        teamMembers: {
          include: {
            user: {
              select: {
                fullName: true,
                role: true,
              }
            }
          }
        }
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_SURGERY',
        tableName: 'surgeries',
        recordId: surgery.id,
        changes: JSON.stringify(validatedData),
      }
    });

    // If EMERGENCY surgery, create an emergency alert automatically
    if (surgeryType === 'EMERGENCY') {
      const escalationDeadline = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      await prisma.emergencySurgeryAlert.create({
        data: {
          surgeryId: surgery.id,
          patientName: patient.name,
          folderNumber: patient.folderNumber || '',
          age: patient.age || 0,
          gender: patient.gender || 'Unknown',
          procedureName: validatedData.procedureName,
          surgicalUnit: validatedData.unit,
          indication: validatedData.indication,
          surgeonId: null,
          surgeonName: validatedData.surgeonName,
          estimatedStartTime: new Date(validatedData.scheduledDate + 'T' + validatedData.scheduledTime),
          priority: 'CRITICAL',
          status: 'ACTIVE',
          displayOnTv: true,
          bloodRequired: validatedData.needBloodTransfusion,
          bloodUnits: validatedData.needBloodTransfusion ? 2 : null, // Default 2 units if blood required
          alertMessage: `EMERGENCY SURGERY: ${validatedData.procedureName} for ${patient.name}`,
          additionalNotes: `Escalation deadline: ${escalationDeadline.toISOString()}`,
        }
      });

      // Log emergency alert creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_EMERGENCY_ALERT',
          tableName: 'EmergencySurgeryAlert',
          recordId: surgery.id,
          changes: JSON.stringify({ 
            type: 'AUTO_TRIGGERED',
            surgeryType: 'EMERGENCY',
            escalationDeadline: escalationDeadline.toISOString()
          }),
        }
      });
    }

    return NextResponse.json(surgery, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Surgery create error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
