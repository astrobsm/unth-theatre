import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const surgeryId = searchParams.get('surgeryId');

    const where = surgeryId ? { surgeryId } : {};

    const checklists = await prisma.wHOChecklist.findMany({
      where,
      include: {
        surgery: {
          include: {
            patient: {
              select: {
                name: true,
                folderNumber: true,
              }
            },
            surgeon: {
              select: {
                fullName: true,
              }
            }
          }
        },
        completedBy: {
          select: {
            fullName: true,
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    // Calculate completion status for each checklist
    const formattedChecklists = checklists.map(checklist => ({
      id: checklist.id,
      surgery: {
        procedureName: checklist.surgery.procedureName,
        scheduledDate: checklist.surgery.scheduledDate,
        patient: checklist.surgery.patient,
        surgeon: checklist.surgery.surgeon,
      },
      signInCompleted: !!(
        checklist.patientConfirmed &&
        checklist.siteMarked &&
        checklist.anesthesiaChecked &&
        checklist.pulseOximeterOn &&
        checklist.allergyChecked
      ),
      timeOutCompleted: !!(
        checklist.teamIntroduced &&
        checklist.confirmProcedurePlanned &&
        checklist.criticalStepsReviewed &&
        checklist.equipmentConcerns &&
        checklist.antibioticGiven &&
        checklist.imagingDisplayed
      ),
      signOutCompleted: !!(
        checklist.procedureRecorded &&
        checklist.instrumentCountCorrect &&
        checklist.specimenLabeled &&
        checklist.equipmentProblems
      ),
      createdAt: checklist.createdAt,
      completedBy: checklist.completedBy,
    }));

    return NextResponse.json(formattedChecklists);

  } catch (error) {
    console.error("Failed to fetch checklists:", error);
    return NextResponse.json(
      { error: "Failed to fetch checklists" },
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
    const { surgeryId, signIn, timeOut, signOut } = body;

    if (!surgeryId) {
      return NextResponse.json({ error: "Surgery ID is required" }, { status: 400 });
    }

    const checklist = await prisma.wHOChecklist.create({
      data: {
        surgeryId,
        // Sign In fields
        patientConfirmed: signIn?.patientConfirmed || false,
        siteMarked: signIn?.siteMarked || false,
        anesthesiaChecked: signIn?.anesthesiaChecked || false,
        pulseOximeterOn: signIn?.pulseOximeterOn || false,
        allergyChecked: signIn?.allergyChecked || false,
        signInNotes: signIn?.signInNotes || '',
        // Time Out fields
        teamIntroduced: timeOut?.teamIntroduced || false,
        confirmProcedurePlanned: timeOut?.confirmProcedurePlanned || false,
        criticalStepsReviewed: timeOut?.criticalStepsReviewed || false,
        equipmentConcerns: timeOut?.equipmentConcerns || false,
        antibioticGiven: timeOut?.antibioticGiven || false,
        imagingDisplayed: timeOut?.imagingDisplayed || false,
        timeOutNotes: timeOut?.timeOutNotes || '',
        // Sign Out fields
        procedureRecorded: signOut?.procedureRecorded || false,
        instrumentCountCorrect: signOut?.instrumentCountCorrect || false,
        specimenLabeled: signOut?.specimenLabeled || false,
        equipmentProblems: signOut?.equipmentProblems || false,
        signOutNotes: signOut?.signOutNotes || '',
        completedById: session.user.id,
      },
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
        action: 'CREATE_WHO_CHECKLIST',
        tableName: 'WHO_CHECKLIST',
        recordId: checklist.id,
        changes: JSON.stringify({ surgeryId }),
      }
    });

    return NextResponse.json(checklist, { status: 201 });

  } catch (error) {
    console.error("Failed to create checklist:", error);
    return NextResponse.json(
      { error: "Failed to create checklist" },
      { status: 500 }
    );
  }
}

