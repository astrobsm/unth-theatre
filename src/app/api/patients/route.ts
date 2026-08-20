import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = 'force-dynamic';

/**
 * A date-and-time coming from an HTML `datetime-local` input.
 *
 * The browser sends "2026-08-18T17:46" — no seconds, no timezone. That is not
 * ISO-8601, and Prisma rejects it outright:
 *
 *     Invalid value for argument `anticoagulantLastDose`:
 *     premature end of input. Expected ISO-8601 DateTime.
 *
 * The four "last dose" fields were declared as plain strings and handed
 * straight to the database, so registering any patient who is on an
 * anticoagulant, an antiplatelet, an ACE inhibitor or an ARB — and who had a
 * last dose recorded — failed with a 500. Staff met it while booking, because
 * registration is the first step of booking, and reported it as "internal
 * server error while trying to book a case".
 *
 * assessmentDate three lines below was already converted correctly, which is
 * why it worked and these did not.
 *
 * An unparseable value is REJECTED rather than quietly dropped. These dates
 * feed the bleeding-risk assessment, and a surgeon reading "no recent dose"
 * for a patient on dabigatran is worse than a form that asks for the date
 * again.
 */
const optionalDateTime = z
  .union([z.string(), z.date()])
  .optional()
  .nullable()
  .transform((val, ctx) => {
    if (val === null || val === undefined || val === '') return null;
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Not a valid date and time.',
      });
      return z.NEVER;
    }
    return d;
  });

const patientSchema = z.object({
  // Basic Information
  name: z.string().min(1),
  folderNumber: z.string().min(1),
  ptNumber: z.string().optional().nullable().transform(val => val || null),
  age: z.number().int().positive(),
  ageUnit: z.enum(['YEARS', 'MONTHS', 'WEEKS', 'DAYS']).optional().default('YEARS'),
  gender: z.string(),
  ward: z.string(),
  phoneNumber: z.string().optional().nullable().transform(val => val || null),
  caregiverName: z.string().optional().nullable().transform(val => val || null),
  caregiverPhone: z.string().optional().nullable().transform(val => val || null),
  
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
  anticoagulantLastDose: optionalDateTime,
  onAntiplatelets: z.boolean().optional(),
  antiplateletName: z.string().optional().nullable().transform(val => val || null),
  antiplateletLastDose: optionalDateTime,
  onACEInhibitors: z.boolean().optional(),
  aceInhibitorName: z.string().optional().nullable().transform(val => val || null),
  aceInhibitorLastDose: optionalDateTime,
  onARBs: z.boolean().optional(),
  arbName: z.string().optional().nullable().transform(val => val || null),
  arbLastDose: optionalDateTime,
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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Optional lookup: ?folderNumber= / ?ptNumber= (exact) or ?q= (contains).
    // Used by the registration form to instantly detect an already-registered
    // patient. With no params it returns the full list (unchanged behaviour).
    const { searchParams } = new URL(request.url);
    const folderNumber = searchParams.get('folderNumber')?.trim();
    const ptNumber = searchParams.get('ptNumber')?.trim();
    const q = searchParams.get('q')?.trim();
    if (folderNumber || ptNumber || q) {
      const or: any[] = [];
      if (folderNumber) or.push({ folderNumber });
      if (ptNumber) or.push({ ptNumber });
      if (q) {
        or.push(
          { folderNumber: { contains: q, mode: 'insensitive' } },
          { ptNumber: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        );
      }
      const matches = await prisma.patient.findMany({ where: { OR: or }, take: 10, orderBy: { createdAt: 'desc' } });
      return NextResponse.json(matches);
    }

    // ── The list is a PICKER, and pickers do not need clinical records ──────
    //
    // This returned every column of every patient. Measured on the theatre
    // server: 546 patients, 736 kB of JSON, for a dropdown that needs 85 kB.
    // The booking page fetches it before the form is usable, and on a poor
    // theatre link most of a minute goes on downloading DVT scores, D-dimer
    // results, anticoagulant histories and pressure-sore assessments so that
    // somebody can pick a name from a list.
    //
    // The three callers — the patient register, the booking form and the
    // transfer form — between them render exactly these eight fields, and the
    // booking page's own Patient interface declares precisely this shape. So
    // this is what is sent.
    //
    // It is also the safer default in its own right: a clinical history should
    // not travel to a browser that only needed a name. Anything wanting the
    // full record fetches the patient by id.
    const patients = await prisma.patient.findMany({
      select: {
        id: true, name: true, folderNumber: true, ptNumber: true,
        age: true, ageUnit: true, gender: true, ward: true,
      },
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

    // Duplicate guard: a patient with this folder (or PT) number already exists.
    // Return the existing record so the UI can offer to continue to booking.
    const existing = await prisma.patient.findFirst({
      where: {
        OR: [
          { folderNumber: validatedData.folderNumber },
          ...(validatedData.ptNumber ? [{ ptNumber: validatedData.ptNumber }] : []),
        ],
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'This patient is already registered.', code: 'DUPLICATE', patient: existing },
        { status: 409 },
      );
    }

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
