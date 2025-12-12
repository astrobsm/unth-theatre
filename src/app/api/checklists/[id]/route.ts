import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const checklistUpdateSchema = z.object({
  patientConfirmed: z.boolean().optional(),
  siteMarked: z.boolean().optional(),
  anesthesiaSafetyCheck: z.boolean().optional(),
  pulseOximeterOn: z.boolean().optional(),
  allergyCheck: z.boolean().optional(),
  signInNotes: z.string().optional(),
  teamIntroduced: z.boolean().optional(),
  procedureConfirmed: z.boolean().optional(),
  criticalStepsReviewed: z.boolean().optional(),
  equipmentConcerns: z.boolean().optional(),
  antibioticGiven: z.boolean().optional(),
  imagingDisplayed: z.boolean().optional(),
  timeOutNotes: z.string().optional(),
  procedureRecorded: z.boolean().optional(),
  instrumentCountCorrect: z.boolean().optional(),
  specimenLabeled: z.boolean().optional(),
  equipmentProblems: z.boolean().optional(),
  recoveryPlan: z.boolean().optional(),
  signOutNotes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = checklistUpdateSchema.parse(body);

    const checklist = await prisma.wHOChecklist.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: true,
          }
        }
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'who_checklists',
        recordId: checklist.id,
        changes: `WHO Checklist updated for surgery ${checklist.surgeryId}`,
      }
    });

    return NextResponse.json(checklist);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to update checklist:", error);
    return NextResponse.json(
      { error: "Failed to update checklist" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user role - only admin can delete
    if (session.user.role !== 'Admin') {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.wHOChecklist.delete({
      where: { id: params.id }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'who_checklists',
        recordId: params.id,
        changes: `WHO Checklist deleted`,
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Failed to delete checklist:", error);
    return NextResponse.json(
      { error: "Failed to delete checklist" },
      { status: 500 }
    );
  }
}
