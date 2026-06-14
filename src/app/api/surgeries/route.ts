import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const surgerySchema = z.object({
  patientId: z.string(),
  surgeonId: z.string().nullish(),
  surgeonName: z.string(),
  unit: z.string(),
  subspecialty: z.string(),
  location: z.string().nullish(),
  theatreId: z.string().nullish(),
  indication: z.string(),
  procedureName: z.string(),
  scheduledDate: z.string(),
  scheduledTime: z.string(),
  estimatedDuration: z.number().int().min(1, 'Estimated duration must be at least 1 minute').default(60),
  surgeryType: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']).default('ELECTIVE'),
  anesthesiaType: z.enum(['GENERAL', 'SPINAL', 'EPIDURAL', 'COMBINED_SPINAL_EPIDURAL', 'LOCAL', 'REGIONAL', 'SEDATION']).nullish(),
  needBloodTransfusion: z.boolean().default(false),
  needDiathermy: z.boolean().default(false),
  needStereo: z.boolean().default(false),
  needMontrellMattress: z.boolean().default(false),
  otherSpecialNeeds: z.string().nullish(),
  // Clinical Summary collected on the booking form. Persisted on the Patient record
  // so the Pharmacy page (and other downstream views) can display them.
  comorbiditiesList: z.array(z.string()).optional(),
  otherComorbidities: z.string().nullish(),
  currentMedicationsList: z.array(z.string()).optional(),
  otherCurrentMedications: z.string().nullish(),
  // Auto-fetched on-duty team. We use the on-duty anaesthetist as the default
  // Surgery.anesthetistId so the Pharmacist can see who will collect the packed meds.
  onDutyTeam: z
    .object({
      date: z.string().optional(),
      shift: z.string().optional(),
      anaesthetistId: z.string().nullish(),
      anaesthetistName: z.string().nullish(),
      anaestheticTechnicianId: z.string().nullish(),
      anaestheticTechnicianName: z.string().nullish(),
      scrubNurseId: z.string().nullish(),
      scrubNurseName: z.string().nullish(),
      cleanerId: z.string().nullish(),
      cleanerName: z.string().nullish(),
      porterId: z.string().nullish(),
      porterName: z.string().nullish(),
    })
    .optional(),
  teamMembers: z.array(z.object({
    name: z.string(),
    role: z.enum(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER']),
    userId: z.string().nullish(),
    staffCode: z.string().nullish(),
  })).optional(),

  // ── Pre-pack plan: surgical consumables to be packed the night before ──
  consumableRequests: z.array(z.object({
    templateId: z.string().nullish(),
    name: z.string().min(1),
    category: z
      .enum([
        'GLOVES','GOWNS_DRAPES','SUTURES','SYRINGES_NEEDLES','CATHETERS_TUBING',
        'DRESSING_PACKS','SKIN_PREP','CLEANING_SOLUTION','STERILE_DRESSINGS',
        'IRRIGATION','DIATHERMY','SUCTION','ANAESTHESIA_AIRWAY','PPE','OTHER',
      ])
      .default('OTHER'),
    size: z.string().nullish(),
    unit: z.string().default('piece'),
    quantity: z.number().int().min(1).default(1),
    notes: z.string().nullish(),
  })).optional(),

  // ── Drugs / IV fluids / wound-dressing agents to be packed by Pharmacy ──
  drugDressingRequests: z.array(z.object({
    templateId: z.string().nullish(),
    name: z.string().min(1),
    type: z
      .enum([
        'ANTIBIOTIC','ANALGESIC','ANAESTHETIC_ADJUNCT','IV_FLUID',
        'WOUND_DRESSING_AGENT','ANTISEPTIC','HAEMOSTATIC','OTHER',
      ])
      .default('OTHER'),
    dosage: z.string().nullish(),
    route: z.string().nullish(),
    quantity: z.number().int().min(1).default(1),
    unit: z.string().default('vial'),
    notes: z.string().nullish(),
  })).optional(),

  // ── Informed consent file uploaded at booking (base64) ──
  consentFile: z.object({
    name: z.string().min(1),
    mimeType: z.string().min(1),
    base64: z.string().min(10), // base64 payload (no "data:" prefix expected, but tolerated)
  }).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const date = searchParams.get('date');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.scheduledDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
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
            ward: true,
          }
        },
        surgeon: {
          select: {
            fullName: true,
          }
        },
        pacuAssessment: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }]
    });

    // Resolve theatre names (theatreId is a string FK-style, no Prisma relation)
    const theatreIds = Array.from(
      new Set(surgeries.map(s => s.theatreId).filter((x): x is string => !!x))
    );
    const theatres = theatreIds.length
      ? await prisma.theatreSuite.findMany({
          where: { id: { in: theatreIds } },
          select: { id: true, name: true, location: true },
        })
      : [];
    const theatreMap = new Map(theatres.map(t => [t.id, t]));

    const enriched = surgeries.map(s => ({
      ...s,
      theatre: s.theatreId ? theatreMap.get(s.theatreId) ?? null : null,
      theatreName: s.theatreId ? theatreMap.get(s.theatreId)?.name ?? null : null,
    }));

    // For daily planning views, keep output stable by sorting by theatre then unit.
    enriched.sort((a, b) => {
      const theatreA = (a.theatreName || 'Unassigned Theatre').toLowerCase();
      const theatreB = (b.theatreName || 'Unassigned Theatre').toLowerCase();
      if (theatreA < theatreB) return -1;
      if (theatreA > theatreB) return 1;

      const unitA = (a.unit || '').toLowerCase();
      const unitB = (b.unit || '').toLowerCase();
      if (unitA < unitB) return -1;
      if (unitA > unitB) return 1;

      const timeA = (a.scheduledTime || '').toLowerCase();
      const timeB = (b.scheduledTime || '').toLowerCase();
      if (timeA < timeB) return -1;
      if (timeA > timeB) return 1;
      return 0;
    });

    return NextResponse.json(enriched);

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

    const {
      teamMembers,
      surgeryType,
      surgeonId,
      surgeonName,
      comorbiditiesList,
      otherComorbidities,
      currentMedicationsList,
      otherCurrentMedications,
      onDutyTeam,
      consumableRequests,
      drugDressingRequests,
      consentFile,
      ...surgeryData
    } = validatedData;

    // Resolve surgeon: if a user id was supplied, validate it and prefer the DB fullName.
    let resolvedSurgeonId: string | null = null;
    let resolvedSurgeonName = surgeonName;
    if (surgeonId) {
      const surgeonUser = await prisma.user.findUnique({
        where: { id: surgeonId },
        select: { id: true, fullName: true },
      });
      if (surgeonUser) {
        resolvedSurgeonId = surgeonUser.id;
        resolvedSurgeonName = surgeonUser.fullName || surgeonName;
      }
    }

    // Get patient details for emergency alert
    const patient = await prisma.patient.findUnique({
      where: { id: validatedData.patientId }
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Persist Clinical Summary (comorbidities + current medications) on the Patient record
    // so the Pharmacist can read it on every prescription. We replace prior values to reflect
    // the most recent assessment by the booking clinician.
    const comorbLines: string[] = [];
    if (comorbiditiesList && comorbiditiesList.length) comorbLines.push(...comorbiditiesList);
    if (otherComorbidities && otherComorbidities.trim()) comorbLines.push(`Other: ${otherComorbidities.trim()}`);

    const medLines: string[] = [];
    if (currentMedicationsList && currentMedicationsList.length) medLines.push(...currentMedicationsList);
    if (otherCurrentMedications && otherCurrentMedications.trim()) medLines.push(`Other: ${otherCurrentMedications.trim()}`);

    if (comorbLines.length || medLines.length) {
      try {
        await prisma.patient.update({
          where: { id: patient.id },
          data: {
            ...(comorbLines.length ? { comorbidities: comorbLines.join('\n') } : {}),
            ...(medLines.length ? { otherMedications: medLines.join('\n') } : {}),
          },
        });
      } catch (e) {
        console.warn('Patient clinical-summary update skipped:', (e as Error)?.message);
      }
    }

    // === 5 PM Cutoff Validation for Elective and Urgent cases ===
    if (surgeryType === 'ELECTIVE' || surgeryType === 'URGENT') {
      const scheduledDate = new Date(validatedData.scheduledDate);
      // Get start of day and end of theatre time (5 PM)
      const dayStart = new Date(scheduledDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(scheduledDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Fetch all existing elective and urgent surgeries for this unit on the same day
      const existingSurgeries = await prisma.surgery.findMany({
        where: {
          unit: validatedData.unit,
          scheduledDate: {
            gte: dayStart,
            lte: dayEnd,
          },
          surgeryType: {
            in: ['ELECTIVE', 'URGENT'],
          },
          status: {
            notIn: ['CANCELLED'],
          },
        },
        select: {
          scheduledTime: true,
          estimatedDuration: true,
        },
      });

      // Calculate cumulative end time
      // Theatre day starts at 8:00 AM (configurable)
      const THEATRE_START_HOUR = 8; // 8:00 AM
      const THEATRE_END_HOUR = 17;  // 5:00 PM
      const THEATRE_END_MINUTES = THEATRE_END_HOUR * 60; // 1020 minutes from midnight

      // Sum up all existing surgery durations
      let totalExistingDurationMinutes = 0;
      for (const s of existingSurgeries) {
        totalExistingDurationMinutes += (s.estimatedDuration || 60);
      }

      // Add the new surgery's duration
      const newTotalDuration = totalExistingDurationMinutes + (validatedData.estimatedDuration || 60);

      // Calculate earliest start time (first surgery of the day)
      // The cumulative end time = theatre start + total duration
      const cumulativeEndMinutes = (THEATRE_START_HOUR * 60) + newTotalDuration;

      if (cumulativeEndMinutes > THEATRE_END_MINUTES) {
        const hoursOver = Math.floor(cumulativeEndMinutes / 60);
        const minsOver = cumulativeEndMinutes % 60;
        const estimatedEndTime = `${hoursOver.toString().padStart(2, '0')}:${minsOver.toString().padStart(2, '0')}`;
        return NextResponse.json(
          {
            error: `Booking rejected: The cumulative duration of elective/urgent surgeries for ${validatedData.unit} on this date would exceed the 5:00 PM theatre cutoff time. Estimated end time: ${estimatedEndTime}. Total scheduled: ${newTotalDuration} minutes. Please reschedule to another day or reduce the number of cases.`,
          },
          { status: 400 }
        );
      }
    }

    // Auto-assign anaesthetist from the duty roster. Prefer whatever the client
    // already resolved (onDutyTeam.anaesthetistId); otherwise look it up server-side
    // from the Roster for the scheduled date/shift/theatre. Falls back to any theatre
    // if no one is rostered specifically for the chosen one — an anaesthetist on duty
    // anywhere in the suite is better than leaving the slot empty.
    let resolvedAnaesthetistId: string | null = onDutyTeam?.anaesthetistId || null;
    if (!resolvedAnaesthetistId) {
      try {
        const sched = new Date(validatedData.scheduledDate);
        const [hh, mm] = (validatedData.scheduledTime || '08:00').split(':').map((n) => parseInt(n, 10));
        if (!Number.isNaN(hh)) sched.setHours(hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
        const hour = sched.getHours();
        const shift: 'MORNING' | 'CALL' | 'NIGHT' =
          hour >= 8 && hour < 16 ? 'MORNING' : hour >= 16 && hour < 22 ? 'CALL' : 'NIGHT';
        const dateOnly = new Date(Date.UTC(sched.getFullYear(), sched.getMonth(), sched.getDate()));

        const baseWhere = { date: dateOnly, shift, staffCategory: 'ANAESTHETISTS' as const };
        const tId = (validatedData.theatreId || '').trim();
        const rosters = await prisma.roster.findMany({
          where: tId ? { ...baseWhere, theatreId: tId } : baseWhere,
          include: { user: { select: { id: true } } },
        });
        const pool = rosters.length
          ? rosters
          : tId
            ? await prisma.roster.findMany({ where: baseWhere, include: { user: { select: { id: true } } } })
            : [];
        const rank = (s: string | null) =>
          s === 'CONSULTANT' ? 0 : s === 'SENIOR_REGISTRAR' ? 1 : s === 'REGISTRAR' ? 2 : 3;
        pool.sort((a, b) => rank(a.seniorityLevel) - rank(b.seniorityLevel));
        resolvedAnaesthetistId = pool[0]?.user.id || null;
      } catch (e) {
        console.warn('Auto-assign anaesthetist from roster failed:', (e as Error)?.message);
      }
    }

    const surgery = await prisma.surgery.create({
      data: {
        ...surgeryData,
        surgeonName: resolvedSurgeonName,
        surgeonId: resolvedSurgeonId,
        // Default the surgery anaesthetist to the on-duty anaesthetist for the chosen
        // theatre/date. The Pharmacist sees this name as "To be collected by".
        anesthetistId: resolvedAnaesthetistId,
        surgeryType: surgeryType,
        scheduledDate: new Date(validatedData.scheduledDate),
        // Informed consent file (base64) — visible to the holding-area nurse for
        // pre-theatre clearance.
        ...(consentFile
          ? {
              consentFileName: consentFile.name,
              consentFileMimeType: consentFile.mimeType,
              consentFileData: consentFile.base64.includes(",")
                ? consentFile.base64.split(",").pop() || consentFile.base64
                : consentFile.base64,
              consentUploadedAt: new Date(),
              consentUploadedById: (session.user as any).id,
            }
          : {}),
        // Create team members if provided
        teamMembers: teamMembers && teamMembers.length > 0 ? {
          create: teamMembers.map(tm => ({
            memberName: tm.name,
            // Link to staff record when picked from the database; null otherwise.
            userId: tm.userId || null,
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

    // Persist booking-time pre-pack plan (consumables for pack provider, drugs for pharmacy)
    if (consumableRequests && consumableRequests.length) {
      await prisma.surgeryConsumableRequest.createMany({
        data: consumableRequests.map((c) => ({
          surgeryId: surgery.id,
          templateId: c.templateId ?? null,
          name: c.name,
          category: c.category as any,
          size: c.size ?? null,
          unit: c.unit ?? "piece",
          quantity: c.quantity,
          notes: c.notes ?? null,
        })),
      });
    }

    if (drugDressingRequests && drugDressingRequests.length) {
      await prisma.surgeryDrugDressingRequest.createMany({
        data: drugDressingRequests.map((d) => ({
          surgeryId: surgery.id,
          templateId: d.templateId ?? null,
          name: d.name,
          type: d.type as any,
          dosage: d.dosage ?? null,
          route: d.route ?? null,
          quantity: d.quantity,
          unit: d.unit ?? "vial",
          notes: d.notes ?? null,
        })),
      });

      // Notify pharmacists so they can begin packing as soon as the booking lands
      try {
        const pharmacists = await prisma.user.findMany({
          where: { role: { in: ["PHARMACIST", "ADMIN", "SYSTEM_ADMINISTRATOR"] }, status: "APPROVED" },
          select: { id: true },
        });
        for (const p of pharmacists) {
          await prisma.notification.create({
            data: {
              userId: p.id,
              type: "STOCK_ALERT",
              title: "New surgical drug/dressing pack request",
              message: `${drugDressingRequests.length} item(s) requested for ${patient.name} (${validatedData.procedureName}) — ${new Date(validatedData.scheduledDate).toLocaleDateString()}.`,
              link: `/dashboard/medication-tracking?surgery=${surgery.id}`,
            },
          });
        }
      } catch (e) {
        console.warn("Pharmacy notification skipped", e);
      }
    }

    // Notify consumable-pack providers (pre-pack night before surgery)
    if (consumableRequests && consumableRequests.length) {
      try {
        const packers = await prisma.user.findMany({
          where: { role: { in: ["CONSUMABLE_PACK_PROVIDER", "THEATRE_STORE_KEEPER", "ADMIN"] }, status: "APPROVED" },
          select: { id: true },
        });
        for (const p of packers) {
          await prisma.notification.create({
            data: {
              userId: p.id,
              type: "STOCK_ALERT",
              title: "New consumables pre-pack request",
              message: `${consumableRequests.length} item(s) requested for ${patient.name} — ${validatedData.procedureName} on ${new Date(validatedData.scheduledDate).toLocaleDateString()}.`,
              link: `/dashboard/consumable-pack-provider?surgery=${surgery.id}`,
            },
          });
        }
      } catch (e) {
        console.warn("Pack-provider notification skipped", e);
      }
    }

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
