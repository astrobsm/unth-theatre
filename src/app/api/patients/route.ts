import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const patientSchema = z.object({
  // Basic Information
  name: z.string().min(1),
  folderNumber: z.string().min(1),
  ptNumber: z.string().optional(),
  age: z.number().int().positive(),
  gender: z.string(),
  ward: z.string(),
  
  // DVT Risk Assessment
  dvtRiskScore: z.number().optional(),
  hasDVTHistory: z.boolean().optional(),
  hasMobilityIssues: z.boolean().optional(),
  hasActiveCancer: z.boolean().optional(),
  hasPriorDVT: z.boolean().optional(),
  dDimerTestDone: z.boolean().optional(),
  dDimerResult: z.string().optional().nullable(),
  dDimerValue: z.number().optional().nullable(),
  
  // Bleeding Risk Assessment
  bleedingRiskScore: z.number().optional(),
  hasBleedingDisorder: z.boolean().optional(),
  hasLiverDisease: z.boolean().optional(),
  hasRenalImpairment: z.boolean().optional(),
  recentBleeding: z.boolean().optional(),
  
  // Pressure Sore Risk
  pressureSoreRisk: z.string().optional(),
  hasPressureSores: z.boolean().optional(),
  mobilityStatus: z.string().optional(),
  nutritionalStatus: z.string().optional(),
  
  // Medications Affecting Surgery
  onAnticoagulants: z.boolean().optional(),
  anticoagulantName: z.string().optional().nullable(),
  anticoagulantLastDose: z.string().optional().nullable(),
  onAntiplatelets: z.boolean().optional(),
  antiplateletName: z.string().optional().nullable(),
  antiplateletLastDose: z.string().optional().nullable(),
  onACEInhibitors: z.boolean().optional(),
  aceInhibitorName: z.string().optional().nullable(),
  aceInhibitorLastDose: z.string().optional().nullable(),
  onARBs: z.boolean().optional(),
  arbName: z.string().optional().nullable(),
  arbLastDose: z.string().optional().nullable(),
  otherMedications: z.string().optional(),
  
  // WHO Operative Fitness Risk Assessment
  whoRiskClass: z.string().optional().nullable(),
  asaScore: z.number().int().min(1).max(6).optional().nullable(),
  comorbidities: z.string().optional(),
  cardiovascularStatus: z.string().optional(),
  respiratoryStatus: z.string().optional(),
  metabolicStatus: z.string().optional(),
  
  // Final Assessment
  finalRiskScore: z.number().optional(),
  fitnessForSurgery: z.string().optional(),
  assessmentNotes: z.string().optional(),
  assessedBy: z.string().optional(),
  assessmentDate: z.date().or(z.string().transform((str) => new Date(str))).optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const patients = await prisma.patient.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(patients);

  } catch (error) {
    console.error("Patients fetch error:", error);
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
    const validatedData = patientSchema.parse(body);

    const patient = await prisma.patient.create({
      data: validatedData
    });

    // Create audit log only if user exists in database
    try {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_PATIENT',
          tableName: 'patients',
          recordId: patient.id,
          changes: JSON.stringify(validatedData),
        }
      });
    } catch (auditError) {
      console.error('Audit log creation failed (user may need to re-login):', auditError);
      // Continue anyway - patient was created successfully
    }

    return NextResponse.json(patient, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Patient create error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
