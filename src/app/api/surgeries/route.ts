import { auditChangesJson } from '@/lib/auditChanges';
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from "@/lib/idempotency";
import { pushToUsers } from "@/lib/pushAll";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { generateUniqueSurgeryCode } from "@/lib/surgeryCodes";
import { buildEmergencyAlertMessage } from "@/lib/emergencyAlert";
import { jsonWithETag } from "@/lib/etag";
import { resolveBasePack, BASE_PACK_LABEL } from "@/lib/baseConsumablePack";
import { checkSlot } from "@/lib/theatreOps/scheduling";
import { isClockTime } from "@/lib/theatreOps/clock";
import { recordProcedureUse } from "@/lib/procedures/usage";
import { ensureEmergencyBooking } from "@/lib/emergency/ensureBooking";
import { safeCreateDraftEstimate } from '@/lib/estimates/autoDraft';
import { checkPreopRequirements } from '@/lib/preopRequirements';
import { parseProcedures, serialiseAdditional } from '@/lib/procedurePacks';
import { buildPackRequests } from '@/lib/packRequests';
import { apiError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * An optional field that an untouched form control fills with "".
 *
 * z.coerce.number()("") is 0 and z.enum() rejects "", so neither an empty
 * string nor undefined can be passed straight through. This maps every
 * "nothing was entered" shape to null before the inner schema sees it, and
 * leaves a real value to be validated normally.
 */
const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    inner.nullish(),
  );

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
  /// Further procedures in the same operation, e.g. a skin graft with a tumour
  /// resection. Newline- or semicolon-separated; the principal procedure keeps its
  /// own field so nothing that reads procedureName today has to change.
  additionalProcedures: z.array(z.string()).or(z.string()).nullish(),
  scheduledDate: z.string(),
  // Both MANDATORY. A case with no committed start time cannot be assessed for
  // delay, and a case with no expected duration cannot have the next one
  // scheduled after it — so a silent default of 60 minutes was quietly
  // producing lists that could not happen.
  // Range-checked, not merely shaped. The regex alone accepted "25:70", which
  // then became an Invalid Date wherever the booking was combined with its
  // date — and an unreadable time is dropped from delay and urgency
  // calculations rather than flagged, so the case would simply stop being
  // counted. isClockTime is the same check the rest of theatreOps uses.
  scheduledTime: z
    .string()
    .refine(isClockTime, 'Give the start time as HH:MM on a 24-hour clock, for example 09:00 or 14:30'),
  estimatedDuration: z
    .number({ required_error: 'How long is the case expected to take, in minutes?' })
    .int()
    .min(5, 'A case takes at least 5 minutes')
    .max(24 * 60, 'That is longer than a day'),
  surgeryType: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']).default('ELECTIVE'),
  magnitude: z.enum(['MAJOR', 'INTERMEDIATE', 'MINOR']).nullish(),
  anesthesiaType: z.enum(['GENERAL', 'SPINAL', 'EPIDURAL', 'COMBINED_SPINAL_EPIDURAL', 'LOCAL', 'REGIONAL', 'SEDATION']).nullish(),
  needBloodTransfusion: z.boolean().default(false),
  needDiathermy: z.boolean().default(false),
  needStereo: z.boolean().default(false),
  needMontrellMattress: z.boolean().default(false),
  otherSpecialNeeds: z.string().nullish(),
  // Planned post-operative disposition (where the patient goes after surgery)
  // and whether it is a same-day (day-case) procedure.
  postOpDestination: z.string().nullish(),
  isDayCase: z.boolean().default(false),
  // Unit supervising consultant (chosen from the surgeon list).
  supervisingConsultantId: z.string().nullish(),
  supervisingConsultantName: z.string().nullish(),
  // ── Pre-operative safety labs & risk assessments ────────────────────────
  //
  // OPTIONAL at the schema, and that is the whole point of the 21 August
  // change. They were required here as well as in checkPreopRequirements, and
  // a validator is a harder refusal than a policy: relaxing the policy alone
  // would have left every lab-less booking failing with a 400 and a message
  // about a haemoglobin, which is precisely the wall the residents described.
  //
  // Still recorded, still returned as outstanding, still shown on the boards —
  // and now enterable by whoever actually holds the result rather than by the
  // resident booking the case.
  //
  // Empty strings arrive from an untouched form field, so they are mapped to
  // null rather than coerced: z.coerce.number()('') is 0, and a haemoglobin of
  // zero recorded as fact is worse than no haemoglobin at all.
  recentHb: emptyToNull(z.coerce.number().positive()),
  hbSampleAt: z.string().nullish(),
  potassium: emptyToNull(z.coerce.number().positive()),
  sodium: emptyToNull(z.coerce.number().positive()),
  creatinine: emptyToNull(z.coerce.number().positive()),
  hbsAgStatus: emptyToNull(z.enum(['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'])),
  hcvStatus: emptyToNull(z.enum(['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'])),
  hivStatus: emptyToNull(z.enum(['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'])),
  bloodPressureSystolic: emptyToNull(z.coerce.number().int().positive()),
  bloodPressureDiastolic: emptyToNull(z.coerce.number().int().positive()),
  bleedingRiskLevel: emptyToNull(z.enum(['LOW', 'MODERATE', 'HIGH'])),
  nutritionalStatusAtBooking: emptyToNull(z.enum(['GOOD', 'FAIR', 'POOR'])),
  // Pressure-sore risk is compulsory only for patients > 45 (enforced on the form).
  pressureSoreRiskAtBooking: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullish(),
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
  // Emergencies only: a named clinician deferring a mandatory requirement.
  // The reason comes from the client; WHO is taken from the session below, never
  // from the body — a client-supplied name is not an attribution.
  preopOverrideReason: z.string().trim().nullish(),
  /**
   * Booked from the third section, with the remaining sections to follow before
   * the morning of surgery. See deferOutstanding in preopRequirements.ts.
   */
  deferOutstanding: z.boolean().optional(),
  /// Set only when the booker has been shown an existing identical case and has
  /// said they mean to book a second one. Absent on every ordinary booking, so
  /// the duplicate check is on by default and has to be opted out of
  /// deliberately rather than opted into.
  allowDuplicate: z.boolean().optional(),
  consentFile: z.object({
    name: z.string().min(1),
    mimeType: z.string().min(1),
    base64: z.string().min(10), // base64 payload (no "data:" prefix expected, but tolerated)
  }).optional(),

  // ── Electronic UNTH consent form captured & signed at booking ──
  consentForm: z.any().optional(),
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
    // Optional cap so dashboard widgets (e.g. CMAC/CMD "recent surgeries") fetch a
    // small, bounded payload instead of the entire surgery history. 1..100.
    const limitParam = searchParams.get('limit');
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 100)
      : null;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    // One unit's cases. This is what lets the surgery page show a card per unit
    // and fetch only the one somebody opens, instead of every case in the
    // hospital so the browser can filter them again.
    const unit = searchParams.get('unit');
    if (unit) {
      where.unit = unit;
    }
    // ?id= was already being SENT — the checklist page asks for
    // /api/surgeries?id=<id> — and was silently ignored, so that page received
    // every surgery in the hospital and picked one out in the browser. Honoured
    // now, which turns a whole-table read into a primary-key lookup.
    const id = searchParams.get('id');
    if (id) {
      where.id = id;
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
      // ── An explicit projection, because `include` was returning the consent
      //    scans ──────────────────────────────────────────────────────────────
      //
      // `include` adds relations to ALL scalar fields, and surgeries carries the
      // informed-consent scan as base64 in consentFileData. Measured on the
      // theatre server:
      //
      //     GET /api/surgeries (no filter)   606 cases    80 MB
      //     of which consent scans                        71 MB
      //     the same list without them                   1.5 MB
      //
      // Three "new case" pickers — cancellations, checklists and mortality —
      // call this endpoint unfiltered to populate a dropdown, so each of them
      // downloads eighty megabytes to list some procedure names. Nothing in the
      // application reads consent data from a list; it is viewed on the case
      // itself, fetched by id.
      //
      // Listed explicitly rather than excluded, so a blob column added to this
      // table next year does not silently join the payload.
      select: {
        id: true, patientId: true, procedureName: true, indication: true,
        scheduledDate: true, scheduledTime: true, createdAt: true,
        surgeryType: true, status: true, listOrder: true, magnitude: true,
        subspecialty: true, unit: true, location: true, theatreId: true,
        surgeonName: true, supervisingConsultantName: true,
        anesthesiaType: true, anesthetistId: true, theatreTechnicianId: true,
        needBloodTransfusion: true, needDiathermy: true, needStereo: true,
        needStirups: true, needMontrellMattress: true, otherSpecialNeeds: true,
        readinessStatus: true, preopOutstanding: true,
        bookedById: true, bookedByName: true,
        consumablePackCode: true, pharmacyDrugCode: true,
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
        holdingAreaAssessment: {
          select: {
            id: true,
            status: true,
            clearedForTheatre: true,
            transferredToTheatre: true,
          },
        },
      },
      // When a limit is requested return the most-recently booked cases; otherwise
      // keep the day-planning order (date, then time).
      orderBy: limit
        ? [{ createdAt: 'desc' }]
        : [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
      ...(limit ? { take: limit } : {}),
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

    // Resolve assigned anaesthetist + anaesthetic technician (both soft refs to
    // User.id, no Prisma relation) so every board can show them on the case.
    const staffIds = Array.from(
      new Set(
        surgeries
          .flatMap(s => [s.anesthetistId, (s as any).theatreTechnicianId])
          .filter((x): x is string => !!x)
      )
    );
    const staff = staffIds.length
      ? await prisma.user.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, fullName: true, phoneNumber: true },
        })
      : [];
    const staffMap = new Map(staff.map(u => [u.id, u]));

    const enriched = surgeries.map(s => ({
      ...s,
      theatre: s.theatreId ? theatreMap.get(s.theatreId) ?? null : null,
      theatreName: s.theatreId ? theatreMap.get(s.theatreId)?.name ?? null : null,
      anaesthetist: s.anesthetistId ? staffMap.get(s.anesthetistId) ?? null : null,
      theatreTechnician: (s as any).theatreTechnicianId ? staffMap.get((s as any).theatreTechnicianId) ?? null : null,
    }));

    // For daily planning views: sort by DATE first, then surgical UNIT, then the
    // theatre for that day, and finally the scheduled start time within the theatre.
    // Skipped when a limit was requested (those callers want most-recent-first).
    if (!limit) {
      enriched.sort((a, b) => {
        const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
        const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;

        const unitA = (a.unit || '').toLowerCase();
        const unitB = (b.unit || '').toLowerCase();
        if (unitA < unitB) return -1;
        if (unitA > unitB) return 1;

        const theatreA = (a.theatreName || 'Unassigned Theatre').toLowerCase();
        const theatreB = (b.theatreName || 'Unassigned Theatre').toLowerCase();
        if (theatreA < theatreB) return -1;
        if (theatreA > theatreB) return 1;

        const timeA = (a.scheduledTime || '').toLowerCase();
        const timeB = (b.scheduledTime || '').toLowerCase();
        if (timeA < timeB) return -1;
        if (timeA > timeB) return 1;
        return 0;
      });
    }

    // ETag/304: when this day's schedule is unchanged, reply 304 (empty body).
    return jsonWithETag(request, enriched);

  } catch (error) {
    return apiError("surgeries.GET", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Idempotency: if an offline-queued booking is replayed on reconnect, return
    // the original response instead of creating a duplicate surgery.
    const idemKey = idempotencyKeyFrom(request);
    const replay = await replayIfSeen(idemKey);
    if (replay) return replay;

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
      consentForm,
      hbSampleAt,
      ...surgeryData
    } = validatedData;

    // Enforce the "haemoglobin sampled within 48 h of surgery" safety rule.
    if (hbSampleAt) {
      const sampleMs = new Date(hbSampleAt).getTime();
      const surgeryMs = new Date(validatedData.scheduledDate).getTime();
      if (Number.isNaN(sampleMs)) {
        return NextResponse.json({ error: 'Invalid haemoglobin sample date/time.' }, { status: 400 });
      }
      const hoursBefore = (surgeryMs - sampleMs) / 3_600_000;
      if (hoursBefore > 48) {
        return NextResponse.json(
          { error: 'Haemoglobin sample must be taken within 48 hours before surgery. Please repeat the FBC.' },
          { status: 400 },
        );
      }
    }

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

    // Prevent double-booking: a patient already scheduled for surgery on the same
    // day cannot be booked again. Cancelled cases are ignored so a re-book after a
    // cancellation is still allowed.
    {
      const bookDate = new Date(validatedData.scheduledDate);
      const bDayStart = new Date(bookDate); bDayStart.setHours(0, 0, 0, 0);
      const bDayEnd = new Date(bookDate); bDayEnd.setHours(23, 59, 59, 999);
      const existingForPatient = await prisma.surgery.findFirst({
        where: {
          patientId: patient.id,
          scheduledDate: { gte: bDayStart, lte: bDayEnd },
          status: { notIn: ['CANCELLED'] },
        },
        select: { id: true },
      });
      if (existingForPatient) {
        return NextResponse.json(
          { error: `Patient already booked for surgery on ${bDayStart.toLocaleDateString()}.` },
          { status: 409 }
        );
      }
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

    // === Theatre list scheduling: the surgeon's time, checked against the list ===
    //
    // Policy:
    //   * Start time and estimated duration are BOTH mandatory (see the schema).
    //   * 20 minutes sit between every pair of cases -- patient out, theatre
    //     cleaned, next patient in.
    //   * The time the surgeon chose is RESPECTED. It is checked against what is
    //     already booked and refused with an explanation if it will not fit,
    //     rather than being silently rewritten.
    //   * Everything must finish by 17:00.
    //
    // This replaces a version that overwrote whatever time an elective booking
    // asked for. That was worse than it sounds: the surgeon believed they had
    // booked 11:00, the system had booked 13:45, and nobody found out until the
    // ward sent the patient at the wrong hour. The arithmetic now lives in
    // lib/theatreOps/scheduling, where it is tested.
    if (surgeryType === 'ELECTIVE' || surgeryType === 'URGENT') {
      const listDate = new Date(validatedData.scheduledDate);
      const dayStart = new Date(listDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(listDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Sequenced within the assigned theatre when one is chosen; otherwise by
      // surgical unit, since a unit without its own theatre still cannot run two
      // cases at once.
      const theatreKey = (validatedData.theatreId || '').trim();
      const sameDayWhere: any = {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        surgeryType: { in: ['ELECTIVE', 'URGENT'] },
        status: { notIn: ['CANCELLED'] },
      };
      if (theatreKey) sameDayWhere.theatreId = theatreKey;
      else sameDayWhere.unit = validatedData.unit;

      const sameDayCases = await prisma.surgery.findMany({
        where: sameDayWhere,
        select: { id: true, scheduledTime: true, estimatedDuration: true },
      });

      const verdict = checkSlot({
        scheduledTime: validatedData.scheduledTime,
        estimatedDuration: validatedData.estimatedDuration,
        existing: sameDayCases.map((x) => ({
          id: x.id,
          scheduledTime: x.scheduledTime,
          estimatedDuration: x.estimatedDuration || 60,
        })),
      });

      if (!verdict.ok) {
        const target = theatreKey ? 'this theatre' : validatedData.unit;
        return NextResponse.json(
          {
            error: `${target}: ${verdict.message}`,
            code: verdict.code,
            // So the form can offer the fix rather than leaving the surgeon to
            // do the arithmetic themselves.
            suggestedStart: verdict.suggestedStart,
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
        const dateOnly = new Date(Date.UTC(sched.getFullYear(), sched.getMonth(), sched.getDate()));

        // Which rostered shift covers this case, in order of preference.
        //
        // Elective anaesthesia is the MORNING list (08:00-16:00). Everything
        // outside that window — early mornings, evenings and overnight — is
        // covered by the CALL team (that is what "on call" means; the roster
        // has a single call team per day, not separate CALL/NIGHT lists).
        //
        // During elective hours we still prefer someone rostered MORNING for
        // the specific theatre, but fall back to the CALL team when no elective
        // list exists (e.g. an urgent case slotted into a call day), so a
        // daytime emergency is never left without an anaesthetist just because
        // the roster only names the call cover.
        const preferredShifts: Array<'MORNING' | 'CALL'> =
          hour >= 8 && hour < 16 ? ['MORNING', 'CALL'] : ['CALL'];

        const rank = (s: string | null) =>
          s === 'CONSULTANT' ? 0 : s === 'SENIOR_REGISTRAR' ? 1 : s === 'REGISTRAR' ? 2 : 3;
        const tId = (validatedData.theatreId || '').trim();

        // For a given shift, prefer someone rostered to the chosen theatre,
        // otherwise anyone on that shift anywhere in the suite.
        const poolForShift = async (shift: 'MORNING' | 'CALL') => {
          const base = { date: dateOnly, shift, staffCategory: 'ANAESTHETISTS' as const, status: 'PUBLISHED' };
          const specific = tId
            ? await prisma.roster.findMany({ where: { ...base, theatreId: tId }, include: { user: { select: { id: true } } } })
            : [];
          if (specific.length) return specific;
          return prisma.roster.findMany({ where: base, include: { user: { select: { id: true } } } });
        };

        // Anaesthetists are rostered per SURGICAL SUBSPECIALTY on elective days
        // (Roster.subRole holds the covered subspecialty). Prefer whoever is
        // rostered to THIS case's subspecialty; only if nobody is do we fall back
        // to the most-senior anaesthetist on that shift (e.g. the call cover).
        const normSub = (s: string | null | undefined) => (s || '').trim().toLowerCase();
        const wantSub = normSub(validatedData.subspecialty);
        for (const shift of preferredShifts) {
          const pool = await poolForShift(shift);
          if (!pool.length) continue;
          const subspecialtyMatch = wantSub ? pool.filter((p) => normSub(p.subRole) === wantSub) : [];
          const chooseFrom = subspecialtyMatch.length ? subspecialtyMatch : pool;
          chooseFrom.sort((a, b) => rank(a.seniorityLevel) - rank(b.seniorityLevel));
          resolvedAnaesthetistId = chooseFrom[0]?.user.id || null;
          if (resolvedAnaesthetistId) break;
        }
      } catch (e) {
        console.warn('Auto-assign anaesthetist from roster failed:', (e as Error)?.message);
      }
    }

    // Patient-facing provider codes — always generated at booking so the surgeon
    // can immediately hand them to the patient (even if the item list is empty,
    // the provider can still confirm "nothing requested" when the code is keyed in).
    const consumablePackCode = await generateUniqueSurgeryCode(prisma, 'consumablePackCode', 'consumable');
    const pharmacyDrugCode = await generateUniqueSurgeryCode(prisma, 'pharmacyDrugCode', 'pharmacy');

    // ── Consent and pre-op requirements ─────────────────────────────────────
    // The labs above are enforced by the schema. Consent is checked here because
    // it can arrive two ways — a scanned paper form or an electronic signature —
    // and either satisfies it.
    //
    // Elective: hard block. Emergency: a named clinician may defer, with a
    // reason, because a hard block would mean theatre never hears about the case.
    const preop = checkPreopRequirements({
      urgency: surgeryType,
      // Pharmacy prepares from drugDressingRequests; the pack provider picks
      // from consumableRequests. Both are now required rather than optional.
      prescriptionItemCount: drugDressingRequests?.length ?? 0,
      consumableRequestCount: consumableRequests?.length ?? 0,
      labs: {
        recentHb: validatedData.recentHb,
        hbSampleAt: validatedData.hbSampleAt,
        potassium: validatedData.potassium,
        sodium: validatedData.sodium,
        creatinine: validatedData.creatinine,
        hbsAgStatus: validatedData.hbsAgStatus,
        hcvStatus: validatedData.hcvStatus,
        hivStatus: validatedData.hivStatus,
        bloodPressureSystolic: validatedData.bloodPressureSystolic,
        bloodPressureDiastolic: validatedData.bloodPressureDiastolic,
      },
      consent: {
        hasUploadedFile: Boolean(consentFile?.base64),
        signedElectronically: Boolean(consentForm),
      },
      deferOutstanding: validatedData.deferOutstanding === true,
      override: {
        reason: validatedData.preopOverrideReason ?? null,
        byId: (session?.user as { id?: string } | undefined)?.id ?? null,
        byName: (session?.user as { name?: string } | undefined)?.name ?? null,
      },
    });

    if (!preop.ok) {
      return NextResponse.json({
        error: preop.overrideRequired
          ? 'This emergency is missing required documentation. Give a clinical reason to proceed without it.'
          : 'Consent and pre-operative results are required before a case can be booked.',
        missing: preop.missing,
        missingDetail: preop.messages,
        // Tells the form whether to offer the override box or simply refuse.
        overrideRequired: preop.overrideRequired,
      }, { status: 400 });
    }

    // ── Is this case already booked? ────────────────────────────────────────
    // On 19 August the orthopaedic team booked a case, saw no confirmation, and
    // tried again several times. Across the database that pattern has produced
    // 24 duplicated cases, 16 of them re-submitted within ten minutes of the
    // first — one of them 4.6 seconds apart. A duplicated case is not a
    // cosmetic problem: it takes a second theatre slot and has a second pack
    // prepared for a patient who is only having one operation.
    //
    // This is NOT a hard block. A second genuine operation on the same patient,
    // same day, is unusual but real, and a system that refused it outright
    // would be wrong in a way nobody could work around. It asks instead: the
    // booker is shown what already exists and must say explicitly that they
    // mean to book another.
    if (!validatedData.allowDuplicate) {
      const already = await prisma.surgery.findFirst({
        where: {
          patientId: validatedData.patientId,
          procedureName: validatedData.procedureName,
          scheduledDate: new Date(validatedData.scheduledDate),
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          id: true, scheduledTime: true, createdAt: true,
          bookedByName: true, consumablePackCode: true, pharmacyDrugCode: true,
          patient: { select: { name: true, folderNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (already) {
        return NextResponse.json(
          {
            error: 'This case is already booked.',
            code: 'ALREADY_BOOKED',
            existing: already,
          },
          { status: 409 },
        );
      }
    }

    const surgery = await prisma.surgery.create({
      data: {
        ...surgeryData,
        surgeonName: resolvedSurgeonName,
        surgeonId: resolvedSurgeonId,
        consumablePackCode,
        pharmacyDrugCode,
        // Default the surgery anaesthetist to the on-duty anaesthetist for the chosen
        // theatre/date. The Pharmacist sees this name as "To be collected by".
        anesthetistId: resolvedAnaesthetistId,
        surgeryType: surgeryType,
        // Who booked it, recorded on the case itself. This used to be readable
        // only from the consumable request rows created further down, so a
        // booking with no consumable pack had no identifiable booker at all —
        // see the bookedById comment in schema.prisma.
        bookedById: (session.user as any).id ?? null,
        bookedByName: (session.user as any).fullName || (session.user as any).name || null,
        // Normalised through the same parser the merge logic uses, so a repeated
        // or blank entry cannot reach the record.
        additionalProcedures: serialiseAdditional(
          parseProcedures(
            validatedData.procedureName,
            Array.isArray(validatedData.additionalProcedures)
              ? validatedData.additionalProcedures.join('\n')
              : validatedData.additionalProcedures ?? null
          )
        ),
        // A deferral is a debt, not a discharge: what is still missing stays on
        // the record and drives the outstanding flag on the boards.
        ...(preop.outstanding.length > 0
          ? {
              // A deferral records itself. The reason differs by route: a
              // clinician waiving a requirement writes one, while a case booked
              // from the third section gets a standard one — but both name who
              // did it and when, because an outstanding item nobody is
              // attached to is an outstanding item nobody clears.
              preopOverrideReason: preop.deferred
                ? (validatedData.preopOverrideReason?.trim() ||
                   'Booked from the third section. Remaining pre-operative sections due before the patient is called on the morning of surgery.')
                : (validatedData.preopOverrideReason ?? null),
              preopOverrideById: (session?.user as { id?: string } | undefined)?.id ?? null,
              preopOverrideByName: (session?.user as { name?: string } | undefined)?.name ?? null,
              preopOverrideAt: new Date(),
              preopOutstanding: preop.outstanding.join(','),
            }
          : {}),
        scheduledDate: new Date(validatedData.scheduledDate),
        // Hb sample timestamp (drives the "within 48 h" safety rule).
        hbSampleAt: hbSampleAt ? new Date(hbSampleAt) : null,
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
        // Electronic UNTH consent form captured & signed at booking. Stored as
        // JSON so every consent-aware view (holding area, pre-op, consent page)
        // can read it. A signed form marks the case as consented electronically.
        ...(consentForm && typeof consentForm === 'object'
          ? (() => {
              const signed = consentForm.useRepresentative
                ? !!consentForm.representativeSignature && !!consentForm.repDoctorSignature
                : !!consentForm.patientSignature && !!consentForm.doctorSignature;
              return {
                consentFormData: JSON.stringify(consentForm),
                consentSignedElectronically: signed,
                ...(signed ? { consentCompletedAt: new Date() } : {}),
              };
            })()
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

    // Persist booking-time pre-pack plan (consumables for pack provider, drugs for pharmacy).
    // The MANDATORY base pack is attached to every booking regardless of what the
    // surgeon selected, scaled to the operative magnitude, and stamped so the pack
    // provider can tell it apart from surgeon-added extras.
    const requesterId = (session.user as any).id;
    const requesterName = (session.user as any).fullName || (session.user as any).name || null;
    const basePackRows = resolveBasePack(validatedData.magnitude).map((b) => ({
      surgeryId: surgery.id,
      templateId: null,
      name: b.name,
      category: b.category as any,
      size: b.size,
      unit: b.unit,
      quantity: b.quantity,
      notes: BASE_PACK_LABEL,
      requestedById: requesterId,
      requestedByName: requesterName,
    }));
    // ── Packs from the confirmed procedure mapping ──────────────────────────
    // Fills in what the form did not send. A booker who chose items explicitly is
    // not overridden — they were looking at the patient; the mapping is a default,
    // not an authority.
    //
    // Never fails the booking: if the mapping screen has not been completed the
    // case is still booked, and the unmapped procedures are reported so somebody
    // can finish it.
    let mapped: Awaited<ReturnType<typeof buildPackRequests>> = {
      consumables: [], drugs: [], packsUsed: [], unmapped: [],
    };
    try {
      mapped = await buildPackRequests(
        validatedData.procedureName,
        Array.isArray(validatedData.additionalProcedures)
          ? validatedData.additionalProcedures.join('\n')
          : validatedData.additionalProcedures ?? null
      );
    } catch (err) {
      console.error('[surgeries] could not build pack requests from the mapping', err);
    }

    const effectiveConsumables = (consumableRequests?.length ? consumableRequests : mapped.consumables);
    const effectiveDrugs = (drugDressingRequests?.length ? drugDressingRequests : mapped.drugs);

    // ── The template names the item, not the client ──────────────────────────
    // The booking form sends a display label beside each templateId, resolved
    // against whichever slice of the catalogue that screen had loaded. When the
    // slice does not contain the template — a subspecialty filter changed after
    // the item was picked, a search narrowed the list — the form falls back to
    // "Unknown", and takes category OTHER and the default size and unit with it.
    //
    // Twenty lines across two cases were stored exactly that way, every one of
    // them carrying a templateId that resolves perfectly well: the pack provider
    // was asked to find "Unknown x2" when the case had requested a urine bag.
    //
    // The label was never the fact. The templateId is, and this side holds the
    // catalogue, so the template wins wherever there is one. What the client
    // sent survives only for free-text lines, which genuinely have no template.
    const packTemplateIds = Array.from(new Set(
      (effectiveConsumables ?? []).map((c) => c.templateId).filter((x): x is string => !!x)
    ));
    const packTemplates = packTemplateIds.length
      ? await prisma.surgicalConsumableTemplate.findMany({
          where: { id: { in: packTemplateIds } },
          select: { id: true, name: true, category: true, size: true, unit: true },
        })
      : [];
    const packTemplateById = new Map(packTemplates.map((t) => [t.id, t]));

    const extraRows = (effectiveConsumables ?? []).map((c) => {
      const t = c.templateId ? packTemplateById.get(c.templateId) : undefined;
      return {
        surgeryId: surgery.id,
        templateId: c.templateId ?? null,
        name: t?.name ?? c.name,
        category: (t?.category ?? c.category) as any,
        // Size and unit describe the catalogue item, so they come from it too —
        // a line labelled from a template but sized from a guess is a different
        // item wearing the right name.
        size: t ? t.size : (c.size ?? null),
        unit: t?.unit ?? c.unit ?? "piece",
        quantity: c.quantity,
        notes: c.notes ?? null,
        requestedById: requesterId,
        requestedByName: requesterName,
      };
    });
    // ── Nothing below this line may report a booked case as unbooked ────────
    // The surgery row is committed. Everything that follows is a consequence of
    // the booking, not the booking itself, and a consequence that fails must be
    // REPORTED rather than allowed to masquerade as the booking failing. The
    // route already understood this for the draft estimate and the procedure
    // statistic — both explicitly voided so they "can never fail a booking" —
    // but the pack lists, the audit log and the emergency alert were left able
    // to do exactly that.
    //
    // Each failure is named and returned to the client, so the surgeon is told
    // "booked, but the pharmacy list did not save" instead of "internal server
    // error" — a sentence they can act on, about a case that genuinely exists.
    const warnings: string[] = [];
    const step = async (what: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.error(`[surgeries] post-booking step failed (${what}) for ${surgery.id}`, e);
        warnings.push(what);
      }
    };

    await step('the consumable pack list', () =>
      prisma.surgeryConsumableRequest.createMany({ data: [...basePackRows, ...extraRows] })
    );

    if (effectiveDrugs && effectiveDrugs.length) {
      // Same reasoning as the consumables above: the template names the drug.
      // Dosage and route are NOT overridden — the form offers the template's
      // defaults and lets the prescriber change them, so what arrives is a
      // clinical decision about this patient and must not be quietly replaced
      // by the catalogue default.
      const drugTemplateIds = Array.from(new Set(
        effectiveDrugs.map((d) => d.templateId).filter((x): x is string => !!x)
      ));
      const drugTemplates = drugTemplateIds.length
        ? await prisma.surgicalDrugDressingTemplate.findMany({
            where: { id: { in: drugTemplateIds } },
            select: { id: true, name: true, type: true, unit: true },
          })
        : [];
      const drugTemplateById = new Map(drugTemplates.map((t) => [t.id, t]));

      await step('the pharmacy pack list', () => prisma.surgeryDrugDressingRequest.createMany({
        data: effectiveDrugs.map((d) => {
          const t = d.templateId ? drugTemplateById.get(d.templateId) : undefined;
          return {
            surgeryId: surgery.id,
            templateId: d.templateId ?? null,
            name: t?.name ?? d.name,
            type: (t?.type ?? d.type) as any,
            dosage: d.dosage ?? null,
            route: d.route ?? null,
            quantity: d.quantity,
            unit: t?.unit ?? d.unit ?? "vial",
            notes: d.notes ?? null,
          };
        }),
      }));

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
              message: `${effectiveDrugs.length} item(s) requested for ${patient.name} (${validatedData.procedureName}) — ${new Date(validatedData.scheduledDate).toLocaleDateString()}.`,
              link: `/dashboard/medication-tracking?surgery=${surgery.id}`,
            },
          });
        }
        // Push to phones/PWAs too (native FCM + web-push; no-ops if unconfigured).
        void pushToUsers(pharmacists.map((p) => p.id), {
          title: '💊 New drug/dressing pack request',
          body: `${effectiveDrugs.length} item(s) for ${patient.name} — ${validatedData.procedureName}.`,
          url: `/dashboard/medication-tracking?surgery=${surgery.id}`,
          priority: 'HIGH', tag: 'pharmacy-pack',
        });
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
              message: `${effectiveConsumables.length} item(s) requested for ${patient.name} — ${validatedData.procedureName} on ${new Date(validatedData.scheduledDate).toLocaleDateString()}.`,
              link: `/dashboard/consumable-pack-provider?surgery=${surgery.id}`,
            },
          });
        }
        void pushToUsers(packers.map((p) => p.id), {
          title: '📦 New consumables pre-pack request',
          body: `${effectiveConsumables.length} item(s) for ${patient.name} — ${validatedData.procedureName}.`,
          url: `/dashboard/consumable-pack-provider?surgery=${surgery.id}`,
          priority: 'HIGH', tag: 'consumable-pack',
        });
      } catch (e) {
        console.warn("Pack-provider notification skipped", e);
      }
    }

    // Log the action.
    //
    // GUARDED, because the row above is already committed. This same call is
    // wrapped in /api/patients with the note "continue anyway — patient was
    // created successfully", so the lesson had already been learned once and
    // not carried across. An audit log that cannot be written — most obviously
    // when session.user.id names an account this node has not received yet,
    // which two synchronising databases make entirely possible — used to throw,
    // and the route answered 500 for a booking that had SUCCEEDED. The surgeon
    // saw a failure, booked it again, and the list gained a phantom case.
    await step('the audit record', () =>
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_SURGERY',
          tableName: 'surgeries',
          recordId: surgery.id,
          changes: auditChangesJson(validatedData),
        }
      })
    );

    // If EMERGENCY surgery, create an emergency alert automatically
    if (surgeryType === 'EMERGENCY') {
      const escalationDeadline = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      await step('the emergency alert', () => prisma.emergencySurgeryAlert.create({
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
          alertMessage: buildEmergencyAlertMessage({
            patientName: patient.name,
            folderNumber: patient.folderNumber,
            age: patient.age,
            gender: patient.gender,
            procedureName: validatedData.procedureName,
            surgicalUnit: validatedData.unit,
            indication: validatedData.indication,
            surgeonName: validatedData.surgeonName,
            estimatedStartTime: validatedData.scheduledTime,
            priority: 'CRITICAL',
            bloodRequired: validatedData.needBloodTransfusion,
            bloodUnits: validatedData.needBloodTransfusion ? 2 : null,
            anaesthesiaType: validatedData.anesthesiaType,
          }),
          additionalNotes: `Escalation deadline: ${escalationDeadline.toISOString()}`,
        }
      }));

      // One shared path onto the emergency board — see lib/emergency/ensureBooking.
      // Awaited so the case is listed before the response returns, but its
      // outcome can never fail the surgery. It returns an outcome rather than
      // throwing, which is why it was already safe; wrapped anyway so that a
      // future change inside it cannot quietly become able to fail a booking.
      await step('the emergency board listing', () =>
        ensureEmergencyBooking(surgery.id, { fallbackUserId: session.user.id })
      );

      // Log emergency alert creation
      await step('the emergency audit record', () => prisma.auditLog.create({
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
      }));
    }

    // Feeds the ordering of the procedure picker. Deliberately not awaited in
    // a way that could fail the booking — a statistic is not worth a case.
    void recordProcedureUse(validatedData.subspecialty, validatedData.procedureName);

    // A DRAFT estimate, so costing starts from something that exists rather
    // than from someone remembering to create it. Same reasoning as above: an
    // estimate is a convenience and must never be able to fail a booking, so it
    // is voided rather than awaited and never throws.
    void safeCreateDraftEstimate({
      surgeryId: surgery.id,
      patientId: surgery.patientId,
      createdById: (session?.user as { id?: string } | undefined)?.id ?? null,
      createdByName: (session?.user as { name?: string } | undefined)?.name ?? null,
    });

    // The case IS booked. Say so, and say plainly what did not complete
    // alongside it, rather than choosing between a lie and a 500.
    //
    // Additive: every existing reader of this response takes fields off the
    // surgery object and is unaffected by an extra one.
    // What is still owed on this case, so the form can say it plainly at the
    // moment of booking rather than leaving the person to discover it on a
    // board later — or, worse, at the theatre door tomorrow morning.
    const outstandingBody = preop.outstanding.length
      ? {
          outstanding: preop.outstanding,
          outstandingMessages: preop.outstandingMessages,
          outstandingDueBy: 'before the patient is called on the morning of surgery',
        }
      : {};

    const responseBody = warnings.length
      ? { ...surgery, ...outstandingBody, warnings }
      : { ...surgery, ...outstandingBody };

    await rememberResult(idemKey, 201, responseBody, 'POST /api/surgeries');
    return NextResponse.json(responseBody, { status: 201 });

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
