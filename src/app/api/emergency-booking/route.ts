import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { triggerRadio } from '@/lib/radioEvents';
import { buildEmergencyAlertMessage } from '@/lib/emergencyAlert';

export const dynamic = 'force-dynamic';

// Schema for creating emergency surgery booking
const createEmergencyBookingSchema = z.object({
  patientName: z.string().min(1, 'Patient name is required'),
  folderNumber: z.string().min(1, 'Folder number is required'),
  age: z.number().optional(),
  gender: z.string().optional(),
  ward: z.string().optional(),
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  procedureName: z.string().min(1, 'Procedure name is required'),
  surgicalUnit: z.string().min(1, 'Surgical unit is required'),
  indication: z.string().min(1, 'Indication for emergency is required'),
  surgeonId: z.string().optional(),
  surgeonName: z.string().optional(),
  anesthetistId: z.string().optional(),
  anesthetistName: z.string().optional(),
  anaesthesiaType: z
    .enum(['LOCAL', 'REGIONAL', 'SPINAL', 'EPIDURAL', 'GENERAL', 'SEDATION', 'NONE'])
    .optional(),
  requiredByTime: z.string().optional(),
  estimatedDuration: z.number().optional(),
  theatreId: z.string().optional(),
  theatreName: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']).default('CRITICAL'),
  classification: z.string().optional(),
  bloodRequired: z.boolean().default(false),
  bloodType: z.string().optional(),
  bloodUnits: z.number().optional(),
  specialEquipment: z.string().optional(),
  specialRequirements: z.string().optional(),
  teamMembers: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.enum(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER']),
        userId: z.string().optional().nullable(),
        staffCode: z.string().optional().nullable(),
      })
    )
    .optional(),
  consentFile: z
    .object({
      name: z.string().min(1),
      mimeType: z.string().min(1),
      base64: z.string().min(10),
    })
    .optional(),
  // Pre-pack lists — same shape as /api/surgeries
  consumableRequests: z
    .array(
      z.object({
        templateId: z.string().optional(),
        name: z.string().min(1),
        category: z.enum([
          'GLOVES','GOWNS_DRAPES','SUTURES','SYRINGES_NEEDLES','CATHETERS_TUBING',
          'DRESSING_PACKS','SKIN_PREP','CLEANING_SOLUTION','STERILE_DRESSINGS',
          'IRRIGATION','DIATHERMY','SUCTION','ANAESTHESIA_AIRWAY','PPE','OTHER',
        ]),
        size: z.string().nullable().optional(),
        unit: z.string().min(1),
        quantity: z.number().int().positive(),
        notes: z.string().nullable().optional(),
      })
    )
    .optional(),
  drugDressingRequests: z
    .array(
      z.object({
        templateId: z.string().optional(),
        name: z.string().min(1),
        type: z.enum([
          'ANTIBIOTIC','ANALGESIC','ANAESTHETIC_ADJUNCT','IV_FLUID',
          'WOUND_DRESSING_AGENT','ANTISEPTIC','HAEMOSTATIC','OTHER',
        ]),
        dosage: z.string().nullable().optional(),
        route: z.string().nullable().optional(),
        quantity: z.number().int().positive(),
        unit: z.string().min(1),
        notes: z.string().nullable().optional(),
      })
    )
    .optional(),
  // Electronic UNTH consent form captured & signed inline at emergency booking.
  consentForm: z.any().optional(),
});

function getDayBounds(inputDate: Date) {
  const start = new Date(inputDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(inputDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function hhmm(date: Date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// GET - Fetch all emergency bookings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (dateFrom || dateTo) {
      where.requestedAt = {};
      if (dateFrom) where.requestedAt.gte = new Date(dateFrom);
      if (dateTo) where.requestedAt.lte = new Date(dateTo);
    }

    const bookings = await prisma.emergencySurgeryBooking.findMany({
      where,
      include: {
        surgeon: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            role: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            role: true,
          },
        },
        surgery: {
          include: {
            patient: true,
          },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { requestedAt: 'desc' },
      ],
    });

    return NextResponse.json(bookings);
  } catch (error) {
    console.error('Error fetching emergency bookings:', error);
    return NextResponse.json([]);
  }
}

// Roles allowed to update the status of an emergency booking
const STATUS_UPDATE_ROLES = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIC_TECHNICIAN',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR',
];

const VALID_BOOKING_STATUSES = [
  'SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
] as const;

const updateStatusSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  status: z.enum(VALID_BOOKING_STATUSES),
});

// PATCH - Update the status of an emergency surgery booking
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = session.user?.role;
    if (!role || !STATUS_UPDATE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update emergency booking status' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { bookingId, status } = updateStatusSchema.parse(body);

    const existing = await prisma.emergencySurgeryBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = await prisma.emergencySurgeryBooking.update({
      where: { id: bookingId },
      data: { status: status as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'EmergencySurgeryBooking',
        recordId: bookingId,
        changes: JSON.stringify({ status: { from: existing.status, to: status } }),
      },
    });

    return NextResponse.json({ booking, message: `Status updated to ${status.replace(/_/g, ' ')}` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating emergency booking status:', error);
    return NextResponse.json(
      { error: 'Failed to update emergency booking status' },
      { status: 500 }
    );
  }
}

// POST - Create new emergency surgery booking + auto-trigger emergency alert
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only surgeons, anesthetists, house officers, theatre managers, and admins can create emergency bookings
    if (!['SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'HOUSE_OFFICER', 'THEATRE_MANAGER', 'ADMIN', 'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create emergency booking' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createEmergencyBookingSchema.parse(body);

    // Determine surgeon
    const surgeonId = validatedData.surgeonId || (session.user.role === 'SURGEON' ? session.user.id : undefined);
    const surgeonName = validatedData.surgeonName || (session.user.role === 'SURGEON' ? (session.user.name || '') : '');

    if (!surgeonId) {
      return NextResponse.json(
        { error: 'Surgeon is required for emergency booking' },
        { status: 400 }
      );
    }

    // Enforce max 2 members per surgical-team category.
    const submittedTeam = validatedData.teamMembers ?? [];
    const roleCounts: Record<string, number> = {};
    for (const tm of submittedTeam) {
      roleCounts[tm.role] = (roleCounts[tm.role] || 0) + 1;
      if (roleCounts[tm.role] > 2) {
        return NextResponse.json(
          { error: `Maximum of 2 team members allowed for role: ${tm.role}` },
          { status: 400 }
        );
      }
    }

    // Resolve requested date. Theatre scheduling uses day-level planning.
    const requestedDate = validatedData.requiredByTime
      ? new Date(validatedData.requiredByTime)
      : new Date();
    const { start: dayStart, end: dayEnd } = getDayBounds(requestedDate);

    // Resolve theatre from surgical-unit allocation if not explicitly supplied.
    let resolvedTheatreId = validatedData.theatreId || null;
    let resolvedTheatreName = validatedData.theatreName || null;
    if (!resolvedTheatreId) {
      const unitAllocation = await prisma.theatreAllocation.findFirst({
        where: {
          surgicalUnit: validatedData.surgicalUnit,
          date: { gte: dayStart, lte: dayEnd },
        },
        include: {
          theatre: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      });
      if (unitAllocation?.theatre) {
        resolvedTheatreId = unitAllocation.theatre.id;
        resolvedTheatreName = unitAllocation.theatre.name;
      }
    }

    // Scheduling policy for each unit/day:
    // - first case starts 09:00
    // - 35-minute turnover between cases
    // - all cases must finish by 17:00
    const UNIT_FIRST_CASE_HOUR = 9;
    const TURNOVER_MINUTES = 35;
    const END_OF_DAY_HOUR = 17;
    const newDuration = validatedData.estimatedDuration ?? 60;

    const unitCases = await prisma.surgery.findMany({
      where: {
        unit: validatedData.surgicalUnit,
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        scheduledDate: true,
        scheduledTime: true,
        estimatedDuration: true,
      },
      orderBy: [{ scheduledTime: 'asc' }, { createdAt: 'asc' }],
    });

    const firstCaseStart = new Date(dayStart);
    firstCaseStart.setHours(UNIT_FIRST_CASE_HOUR, 0, 0, 0);
    let nextStart = new Date(firstCaseStart);

    if (unitCases.length > 0) {
      let latestEnd = new Date(firstCaseStart);
      for (const c of unitCases) {
        const [hStr, mStr] = (c.scheduledTime || '09:00').split(':');
        const h = Number(hStr);
        const m = Number(mStr);
        const cStart = new Date(dayStart);
        cStart.setHours(Number.isNaN(h) ? 9 : h, Number.isNaN(m) ? 0 : m, 0, 0);
        const cEnd = new Date(cStart.getTime() + (c.estimatedDuration || 60) * 60 * 1000);
        if (cEnd > latestEnd) latestEnd = cEnd;
      }
      nextStart = new Date(latestEnd.getTime() + TURNOVER_MINUTES * 60 * 1000);
    }

    const projectedEnd = new Date(nextStart.getTime() + newDuration * 60 * 1000);
    const dayCutoff = new Date(dayStart);
    dayCutoff.setHours(END_OF_DAY_HOUR, 0, 0, 0);
    if (projectedEnd > dayCutoff) {
      return NextResponse.json(
        {
          error:
            `Booking rejected: this case would end at ${hhmm(projectedEnd)}, beyond the 5:00 PM cutoff. ` +
            `Please reduce duration or move to another date/unit.`,
        },
        { status: 400 }
      );
    }

    // Team carry-over policy:
    // if same unit already has a case that day, reuse the first case team for all
    // subsequent cases.
    let effectiveTeam = submittedTeam;
    if (unitCases.length > 0) {
      const firstCase = await prisma.surgery.findFirst({
        where: {
          unit: validatedData.surgicalUnit,
          scheduledDate: { gte: dayStart, lte: dayEnd },
          status: { not: 'CANCELLED' },
        },
        include: {
          teamMembers: {
            select: {
              role: true,
              memberName: true,
              userId: true,
            },
          },
        },
        orderBy: [{ scheduledTime: 'asc' }, { createdAt: 'asc' }],
      });
      if (firstCase?.teamMembers?.length) {
        effectiveTeam = firstCase.teamMembers.map((m) => ({
          role: m.role as 'CONSULTANT' | 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'HOUSE_OFFICER',
          name: m.memberName || 'Unnamed',
          userId: m.userId,
          staffCode: null,
        }));
      }
    }

    // Create the emergency booking
    const booking = await prisma.emergencySurgeryBooking.create({
      data: {
        patientName: validatedData.patientName,
        folderNumber: validatedData.folderNumber,
        age: validatedData.age,
        gender: validatedData.gender,
        ward: validatedData.ward,
        diagnosis: validatedData.diagnosis,
        procedureName: validatedData.procedureName,
        surgicalUnit: validatedData.surgicalUnit,
        indication: validatedData.indication,
        surgeonId: surgeonId,
        surgeonName: surgeonName,
        anesthetistId: validatedData.anesthetistId || null,
        anesthetistName: validatedData.anesthetistName || null,
        anaesthesiaType: validatedData.anaesthesiaType || null,
        requiredByTime: nextStart,
        estimatedDuration: newDuration,
        theatreId: resolvedTheatreId,
        theatreName: resolvedTheatreName,
        priority: validatedData.priority,
        classification: validatedData.classification,
        bloodRequired: validatedData.bloodRequired,
        bloodType: validatedData.bloodType,
        bloodUnits: validatedData.bloodUnits,
        specialEquipment: validatedData.specialEquipment,
        specialRequirements: validatedData.specialRequirements,
        status: 'SUBMITTED',
      },
      include: {
        surgeon: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
        anesthetist: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
      },
    });

    // AUTO-TRIGGER EMERGENCY ALERT
    // Find or create a patient record
    let patient = await prisma.patient.findFirst({
      where: { folderNumber: validatedData.folderNumber },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          name: validatedData.patientName,
          folderNumber: validatedData.folderNumber,
          age: validatedData.age ?? 0,
          gender: validatedData.gender || 'Unknown',
          ward: validatedData.ward || 'Emergency',
        },
      });
    }

    // Create a surgery record
    const scheduledDate = new Date(nextStart);
    const scheduledTime = hhmm(nextStart);
    const surgery = await prisma.surgery.create({
      data: {
        patientId: patient.id,
        procedureName: validatedData.procedureName,
        subspecialty: validatedData.surgicalUnit,
        unit: validatedData.surgicalUnit,
        indication: validatedData.indication,
        surgeonId: surgeonId,
        surgeonName: surgeonName,
        anesthetistId: validatedData.anesthetistId || null,
        scheduledDate: scheduledDate,
        scheduledTime: scheduledTime,
        estimatedDuration: newDuration,
        theatreId: resolvedTheatreId,
        surgeryType: 'EMERGENCY',
        status: 'SCHEDULED',
        needBloodTransfusion: validatedData.bloodRequired || false,
        otherSpecialNeeds: validatedData.specialEquipment || null,
        remarks: validatedData.specialRequirements || null,
        ...(validatedData.consentFile
          ? {
              consentFileName: validatedData.consentFile.name,
              consentFileMimeType: validatedData.consentFile.mimeType,
              consentFileData: validatedData.consentFile.base64.includes(',')
                ? validatedData.consentFile.base64.split(',').pop() || validatedData.consentFile.base64
                : validatedData.consentFile.base64,
              consentUploadedAt: new Date(),
              consentUploadedById: session.user.id,
            }
          : {}),
        ...(validatedData.consentForm && typeof validatedData.consentForm === 'object'
          ? (() => {
              const cf: any = validatedData.consentForm;
              const signed = cf.useRepresentative
                ? !!cf.representativeSignature && !!cf.repDoctorSignature
                : !!cf.patientSignature && !!cf.doctorSignature;
              return {
                consentFormData: JSON.stringify(cf),
                consentSignedElectronically: signed,
                ...(signed ? { consentCompletedAt: new Date() } : {}),
              };
            })()
          : {}),
        teamMembers: effectiveTeam.length
          ? {
              create: effectiveTeam.map((tm) => ({
                role: tm.role,
                memberName: tm.name,
                userId: tm.userId || null,
              })),
            }
          : undefined,
      },
    });

    // Link surgery to booking
    await prisma.emergencySurgeryBooking.update({
      where: { id: booking.id },
      data: { surgeryId: surgery.id },
    });

    // Create Emergency Surgery Alert (wired to emergency alert system)
    const emergencyAlert = await prisma.emergencySurgeryAlert.create({
      data: {
        surgeryId: surgery.id,
        patientName: validatedData.patientName,
        folderNumber: validatedData.folderNumber,
        age: validatedData.age,
        gender: validatedData.gender,
        procedureName: validatedData.procedureName,
        surgicalUnit: validatedData.surgicalUnit,
        indication: validatedData.indication,
        surgeonId: surgeonId,
        surgeonName: surgeonName,
        anesthetistId: validatedData.anesthetistId || null,
        estimatedStartTime: nextStart,
        theatreId: resolvedTheatreId,
        theatreName: resolvedTheatreName,
        bloodRequired: validatedData.bloodRequired,
        bloodUnits: validatedData.bloodUnits,
        specialEquipment: validatedData.specialEquipment,
        priority: validatedData.priority,
        alertMessage: buildEmergencyAlertMessage({
          patientName: validatedData.patientName,
          folderNumber: validatedData.folderNumber,
          age: validatedData.age,
          gender: validatedData.gender,
          procedureName: validatedData.procedureName,
          surgicalUnit: validatedData.surgicalUnit,
          indication: validatedData.indication,
          surgeonName: surgeonName,
          anaesthetistName: validatedData.anesthetistName,
          theatreName: resolvedTheatreName,
          estimatedStartTime: hhmm(nextStart),
          priority: validatedData.priority,
          bloodRequired: validatedData.bloodRequired,
          bloodUnits: validatedData.bloodUnits,
          bloodType: validatedData.bloodType,
          specialEquipment: validatedData.specialEquipment,
          anaesthesiaType: validatedData.anaesthesiaType,
        }),
        additionalNotes: validatedData.specialRequirements,
        status: 'ACTIVE',
        displayOnTv: true,
      },
    });

    // Update booking with alert ID
    await prisma.emergencySurgeryBooking.update({
      where: { id: booking.id },
      data: {
        emergencyAlertId: emergencyAlert.id,
        alertsSentAt: new Date(),
        notifiedRoles: JSON.stringify([
          'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ANAESTHETIST', 'SCRUB_NURSE',
          'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'ANAESTHETIC_TECHNICIAN',
          'PORTER', 'BLOODBANK_STAFF', 'PHARMACIST', 'CONSUMABLE_PACK_PROVIDER',
          'CMAC', 'DC_MAC',
        ]),
      },
    });

    // ── Pre-pack lists: persist consumables & drugs/dressings and notify packers
    const consumableRequests = validatedData.consumableRequests ?? [];
    const drugDressingRequests = validatedData.drugDressingRequests ?? [];

    if (consumableRequests.length > 0) {
      await prisma.surgeryConsumableRequest.createMany({
        data: consumableRequests.map((c) => ({
          surgeryId: surgery.id,
          templateId: c.templateId || null,
          name: c.name,
          category: c.category as any,
          size: c.size ?? null,
          unit: c.unit,
          quantity: c.quantity,
          notes: c.notes ?? null,
          requestedById: session.user.id,
          requestedByName: session.user.name || null,
        })),
      });

      // Notify Consumable Pack Providers with red EMERGENCY tag
      const packProviders = await prisma.user.findMany({
        where: { role: 'CONSUMABLE_PACK_PROVIDER', status: 'APPROVED' },
        select: { id: true },
      });
      if (packProviders.length > 0) {
        await prisma.notification.createMany({
          data: packProviders.map((u) => ({
            userId: u.id,
            type: 'STOCK_ALERT' as any,
            title: '🚨 EMERGENCY: New consumable pre-pack request',
            message: `Emergency ${validatedData.procedureName} for ${validatedData.patientName} — ${consumableRequests.length} item(s) to pack.`,
            link: '/dashboard/consumable-pack-provider',
          })),
        });
      }
    }

    if (drugDressingRequests.length > 0) {
      await prisma.surgeryDrugDressingRequest.createMany({
        data: drugDressingRequests.map((d) => ({
          surgeryId: surgery.id,
          templateId: d.templateId || null,
          name: d.name,
          type: d.type as any,
          dosage: d.dosage ?? null,
          route: d.route ?? null,
          quantity: d.quantity,
          unit: d.unit,
          notes: d.notes ?? null,
        })),
      });

      // Notify Pharmacy with red EMERGENCY tag
      const pharmacists = await prisma.user.findMany({
        where: { role: 'PHARMACIST', status: 'APPROVED' },
        select: { id: true },
      });
      if (pharmacists.length > 0) {
        await prisma.notification.createMany({
          data: pharmacists.map((u) => ({
            userId: u.id,
            type: 'STOCK_ALERT' as any,
            title: '🚨 EMERGENCY: New surgical drug/dressing pre-pack',
            message: `Emergency ${validatedData.procedureName} for ${validatedData.patientName} — ${drugDressingRequests.length} item(s) to pack.`,
            link: `/dashboard/prescriptions?surgery=${surgery.id}`,
          })),
        });
      }
    }

    // If blood is required, auto-create blood request
    if (validatedData.bloodRequired && validatedData.bloodUnits) {
      await prisma.bloodRequest.create({
        data: {
          surgeryId: surgery.id,
          patientId: patient.id,
          patientName: validatedData.patientName,
          folderNumber: validatedData.folderNumber,
          bloodType: validatedData.bloodType || 'Unknown',
          rhFactor: 'Positive',
          unitsRequested: validatedData.bloodUnits,
          bloodProducts: JSON.stringify(['Packed Red Blood Cells']),
          scheduledSurgeryDate: surgery.scheduledDate,
          surgeryType: 'EMERGENCY',
          isEmergency: true,
          procedureName: validatedData.procedureName,
          requestedById: session.user.id,
          requestedByName: session.user.name || '',
          urgency: 'EMERGENCY',
          priorityLevel: 1,
          status: 'REQUESTED',
        },
      });
    }

    // TV Alert display log
    try {
      await prisma.tvAlertDisplayLog.create({
        data: {
          alertId: emergencyAlert.id,
          alertType: 'EMERGENCY_SURGERY_BOOKING',
          tvLocation: 'All Theatre Locations',
        },
      });
    } catch (e) {
      // TV log table may not exist
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencySurgeryBooking',
        recordId: booking.id,
        changes: JSON.stringify({
          booking: booking.id,
          surgery: surgery.id,
          alert: emergencyAlert.id,
          patientName: validatedData.patientName,
          procedure: validatedData.procedureName,
          priority: validatedData.priority,
        }),
      },
    });

    // Theatre Radio: announce emergency booking
    const anaesNote = validatedData.anaesthesiaType
      ? validatedData.anaesthesiaType === 'LOCAL' || validatedData.anaesthesiaType === 'NONE'
        ? ` Anaesthesia: ${validatedData.anaesthesiaType} — no anaesthetist review required.`
        : ` Anaesthesia: ${validatedData.anaesthesiaType}.`
      : '';
    await triggerRadio({
      category: 'EMERGENCY',
      title: `Emergency case booked${resolvedTheatreName ? ' — ' + resolvedTheatreName : ''}`,
      message: `${validatedData.priority} priority emergency. ${validatedData.procedureName} for ${validatedData.patientName}, folder ${validatedData.folderNumber}. Indication: ${validatedData.indication}. Start: ${hhmm(nextStart)}.${anaesNote}${validatedData.bloodRequired ? ` Blood required: ${validatedData.bloodUnits ?? ''} unit(s) ${validatedData.bloodType ?? ''}.` : ''}${validatedData.specialEquipment ? ` Special equipment: ${validatedData.specialEquipment}.` : ''} All theatre staff please respond.`,
      location: resolvedTheatreName ?? null,
      specialty: validatedData.surgicalUnit,
      urgency: validatedData.priority === 'CRITICAL' ? 'CRITICAL' : validatedData.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
      requireAck: true,
      repeatUntilAck: true,
      repeatEverySec: 45,
      triggeredById: session.user.id,
      metadata: { surgeryId: surgery.id, bookingId: booking.id, alertId: emergencyAlert.id },
    });

    return NextResponse.json({
      booking,
      surgery,
      emergencyAlert,
      message: 'Emergency booking submitted and emergency alerts raised',
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating emergency booking:', error);
    return NextResponse.json(
      { error: 'Failed to create emergency booking' },
      { status: 500 }
    );
  }
}
