import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const patientSchema = z.object({
  // Basic Information
  name: z.string().min(1),
  folderNumber: z.string().min(1),
  ptNumber: z.string().optional().nullable().transform(val => val || null),
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
  dDimerResult: z.string().optional().nullable().transform(val => val || null),
  dDimerValue: z.number().optional().nullable(),
  
  // Bleeding Risk Assessment
  bleedingRiskScore: z.number().optional(),
  hasBleedingDisorder: z.boolean().optional(),
  hasLiverDisease: z.boolean().optional(),
  hasRenalImpairment: z.boolean().optional(),
  recentBleeding: z.boolean().optional(),
  
  // Pressure Sore Risk
  pressureSoreRisk: z.string().optional().nullable().transform(val => val || null),
  hasPressureSores: z.boolean().optional(),
  mobilityStatus: z.string().optional().nullable().transform(val => val || null),
  nutritionalStatus: z.string().optional().nullable().transform(val => val || null),
  
  // Medications Affecting Surgery
  onAnticoagulants: z.boolean().optional(),
  anticoagulantName: z.string().optional().nullable().transform(val => val || null),
  anticoagulantLastDose: z.string().optional().nullable().transform(val => val || null),
  onAntiplatelets: z.boolean().optional(),
  antiplateletName: z.string().optional().nullable().transform(val => val || null),
  antiplateletLastDose: z.string().optional().nullable().transform(val => val || null),
  onACEInhibitors: z.boolean().optional(),
  aceInhibitorName: z.string().optional().nullable().transform(val => val || null),
  aceInhibitorLastDose: z.string().optional().nullable().transform(val => val || null),
  onARBs: z.boolean().optional(),
  arbName: z.string().optional().nullable().transform(val => val || null),
  arbLastDose: z.string().optional().nullable().transform(val => val || null),
  otherMedications: z.string().optional().nullable().transform(val => val || null),
  
  // WHO Operative Fitness Risk Assessment
  whoRiskClass: z.string().optional().nullable().transform(val => val || null),
  asaScore: z.number().int().min(1).max(6).optional().nullable(),
  comorbidities: z.string().optional().nullable().transform(val => val || null),
  cardiovascularStatus: z.string().optional().nullable().transform(val => val || null),
  respiratoryStatus: z.string().optional().nullable().transform(val => val || null),
  metabolicStatus: z.string().optional().nullable().transform(val => val || null),
  
  // Final Assessment
  finalRiskScore: z.number().optional().nullable(),
  fitnessForSurgery: z.string().optional().nullable().transform(val => val || null),
  assessmentNotes: z.string().optional().nullable().transform(val => val || null),
  assessedBy: z.string().optional().nullable().transform(val => val || null),
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
    console.log('Received patient data:', JSON.stringify(body, null, 2));
    
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
      console.error('Validation error:', JSON.stringify(error.errors, null, 2));
      return NextResponse.json(
        { error: "Invalid input data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Patient create error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
