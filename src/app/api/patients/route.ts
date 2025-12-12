import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patientSchema = z.object({
  name: z.string().min(1),
  folderNumber: z.string().min(1),
  ptNumber: z.string().optional(),
  age: z.number().int().positive(),
  gender: z.string(),
  ward: z.string(),
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
