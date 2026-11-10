import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normaliseCode } from "@/lib/surgeryCodes";
import { patientNumberForms, ambiguousNumberMessage } from "@/lib/patients/numberForms";

export const dynamic = "force-dynamic";

/**
 * The three codes for a case, for the desk that is looking at it.
 *
 * Returned on EVERY result, whichever way the case was found. A pharmacist
 * who looked a patient up by PT number is the person most likely to be asked
 * "what is my code?", and before this the codes were read out of the database
 * and then thrown away before the screen saw them.
 *
 * A missing code comes back as null, never as a stand-in. The old code did
 * `pharmacyDrugCode ?? patientIdentifier`, so a case booked before the codes
 * existed displayed the patient's own PT number in the place a PH- code goes
 * — and a pharmacist reading that out sends the patient away with something
 * that is not a code and will never resolve.
 */
function codesOf(s: {
  consumablePackCode?: string | null;
  pharmacyDrugCode?: string | null;
  anaesthesiaDrugCode?: string | null;
} | null | undefined) {
  return {
    consumable: s?.consumablePackCode ?? null,
    pharmacy: s?.pharmacyDrugCode ?? null,
    anaesthesia: s?.anaesthesiaDrugCode ?? null,
  };
}

// GET /api/surgery-codes/lookup?code=CP-XXXXXX
// A provider keys in the patient's code and sees exactly what was requested.
// The code itself is the access token, but a valid session is still required so
// only staff can resolve it.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const patientIdentifier = searchParams.get("patientIdentifier")?.trim() || "";
  const expectedType = searchParams.get("type") as "CONSUMABLE" | "PHARMACY" | "ANAESTHESIA" | null;

  if (patientIdentifier && (expectedType === "CONSUMABLE" || expectedType === "PHARMACY" || expectedType === "ANAESTHESIA")) {
    // ── Which patient is this? ────────────────────────────────────────────
    //
    // Resolved FIRST, and on its own, for two reasons.
    //
    // The number is typed six ways — PT-12345, PT 12345, PT12345, sometimes
    // bare digits off the card — and the stored value is one of them. An
    // exact match failed for a patient who was on file and standing at the
    // counter, and the screen said "no surgery found", which reads as "never
    // booked" and sends somebody to the booking office.
    //
    // And because the old query nested the patient match inside a findFirst
    // on the request table, two patients matching one number resolved
    // silently to whichever had the most recent request. At a pharmacy
    // window that dispenses the wrong patient's drugs. Now it refuses and
    // names them.
    const forms = patientNumberForms(patientIdentifier);
    const matches = await prisma.patient.findMany({
      where: {
        OR: forms.candidates.flatMap((c) => [
          { folderNumber: { equals: c, mode: "insensitive" as const } },
          { ptNumber: { equals: c, mode: "insensitive" as const } },
        ]),
      },
      select: { id: true, name: true, folderNumber: true, ptNumber: true },
    });

    if (matches.length > 1) {
      return NextResponse.json(
        {
          found: false,
          ambiguous: true,
          error: ambiguousNumberMessage(patientIdentifier, matches),
        },
        { status: 409 }
      );
    }

    if (matches.length === 0) {
      return NextResponse.json(
        {
          found: false,
          error: `No patient on file matches "${patientIdentifier}". `
            + `The number can be typed PT-12345, PT 12345 or PT12345, `
            + `or as the folder number.`,
        },
        { status: 404 }
      );
    }

    const patientWhere = { id: matches[0].id };

    if (expectedType === "CONSUMABLE") {
      const latestRequest = await prisma.surgeryConsumableRequest.findFirst({
        where: { surgery: { patient: patientWhere } },
        orderBy: { createdAt: "desc" },
        include: {
          surgery: {
            select: {
              id: true,
              procedureName: true,
              scheduledDate: true,
              scheduledTime: true,
              surgeonName: true,
              surgeryType: true,
              subspecialty: true,
              location: true,
              consumablePackCode: true,
              pharmacyDrugCode: true,
              anaesthesiaDrugCode: true,
              patient: {
                select: {
                  name: true,
                  folderNumber: true,
                  ptNumber: true,
                  phoneNumber: true,
                  caregiverName: true,
                  caregiverPhone: true,
                },
              },
            },
          },
        },
      });

      if (latestRequest?.surgery) {
        const items = await prisma.surgeryConsumableRequest.findMany({
          where: { surgeryId: latestRequest.surgery.id },
          orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({
          found: true,
          codeType: "CONSUMABLE",
          code: latestRequest.surgery.consumablePackCode ?? null,
          codes: codesOf(latestRequest.surgery),
          patient: {
            name: latestRequest.surgery.patient?.name ?? null,
            folderNumber: latestRequest.surgery.patient?.ptNumber ?? latestRequest.surgery.patient?.folderNumber ?? null,
            phoneNumber: latestRequest.surgery.patient?.phoneNumber ?? null,
            caregiverName: latestRequest.surgery.patient?.caregiverName ?? null,
            caregiverPhone: latestRequest.surgery.patient?.caregiverPhone ?? null,
          },
          surgery: {
            id: latestRequest.surgery.id,
            procedureName: latestRequest.surgery.procedureName,
            scheduledDate: latestRequest.surgery.scheduledDate,
            scheduledTime: latestRequest.surgery.scheduledTime,
            surgeonName: latestRequest.surgery.surgeonName,
            surgeryType: latestRequest.surgery.surgeryType,
            subspecialty: latestRequest.surgery.subspecialty,
            location: latestRequest.surgery.location,
          },
          items,
        });
      }
    }

    if (expectedType === "PHARMACY") {
      const latestRequest = await prisma.surgeryDrugDressingRequest.findFirst({
        where: { surgery: { patient: patientWhere } },
        orderBy: { createdAt: "desc" },
        include: {
          surgery: {
            select: {
              id: true,
              procedureName: true,
              scheduledDate: true,
              scheduledTime: true,
              surgeonName: true,
              surgeryType: true,
              subspecialty: true,
              location: true,
              consumablePackCode: true,
              pharmacyDrugCode: true,
              anaesthesiaDrugCode: true,
              patient: {
                select: {
                  name: true,
                  folderNumber: true,
                  ptNumber: true,
                  phoneNumber: true,
                  caregiverName: true,
                  caregiverPhone: true,
                },
              },
            },
          },
        },
      });

      if (latestRequest?.surgery) {
        const items = await prisma.surgeryDrugDressingRequest.findMany({
          where: { surgeryId: latestRequest.surgery.id },
          orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({
          found: true,
          codeType: "PHARMACY",
          code: latestRequest.surgery.pharmacyDrugCode ?? null,
          codes: codesOf(latestRequest.surgery),
          patient: {
            name: latestRequest.surgery.patient?.name ?? null,
            folderNumber: latestRequest.surgery.patient?.ptNumber ?? latestRequest.surgery.patient?.folderNumber ?? null,
            phoneNumber: latestRequest.surgery.patient?.phoneNumber ?? null,
            caregiverName: latestRequest.surgery.patient?.caregiverName ?? null,
            caregiverPhone: latestRequest.surgery.patient?.caregiverPhone ?? null,
          },
          surgery: {
            id: latestRequest.surgery.id,
            procedureName: latestRequest.surgery.procedureName,
            scheduledDate: latestRequest.surgery.scheduledDate,
            scheduledTime: latestRequest.surgery.scheduledTime,
            surgeonName: latestRequest.surgery.surgeonName,
            surgeryType: latestRequest.surgery.surgeryType,
            subspecialty: latestRequest.surgery.subspecialty,
            location: latestRequest.surgery.location,
          },
          items,
        });
      }
    }

    if (expectedType === "ANAESTHESIA") {
      const latestPrescription = await prisma.anestheticPrescription.findFirst({
        where: { patient: patientWhere },
        orderBy: { prescriptionDate: "desc" },
        include: {
          patient: {
            select: {
              name: true,
              folderNumber: true,
              ptNumber: true,
              phoneNumber: true,
              caregiverName: true,
              caregiverPhone: true,
            },
          },
          surgery: {
            select: {
              id: true,
              procedureName: true,
              scheduledDate: true,
              scheduledTime: true,
              surgeonName: true,
              surgeryType: true,
              subspecialty: true,
              location: true,
              consumablePackCode: true,
              pharmacyDrugCode: true,
              anaesthesiaDrugCode: true,
            },
          },
        },
      });

      if (latestPrescription) {
        return NextResponse.json({
          found: true,
          codeType: "ANAESTHESIA",
          code: latestPrescription.surgery?.anaesthesiaDrugCode ?? null,
          codes: codesOf(latestPrescription.surgery),
          patient: {
            name: latestPrescription.patient?.name ?? latestPrescription.patientName ?? null,
            folderNumber: latestPrescription.patient?.ptNumber ?? latestPrescription.patient?.folderNumber ?? null,
            phoneNumber: latestPrescription.patient?.phoneNumber ?? null,
            caregiverName: latestPrescription.patient?.caregiverName ?? null,
            caregiverPhone: latestPrescription.patient?.caregiverPhone ?? null,
          },
          surgery: latestPrescription.surgery ? {
            id: latestPrescription.surgery.id,
            procedureName: latestPrescription.surgery.procedureName,
            scheduledDate: latestPrescription.surgery.scheduledDate,
            scheduledTime: latestPrescription.surgery.scheduledTime,
            surgeonName: latestPrescription.surgery.surgeonName,
            surgeryType: latestPrescription.surgery.surgeryType,
            subspecialty: latestPrescription.surgery.subspecialty,
            location: latestPrescription.surgery.location,
          } : null,
          items: [latestPrescription],
        });
      }
    }

    // The patient IS on file — matched above — so this is a different fact
    // from "no such number", and the two used to read identically. One sends
    // somebody to the booking office; this one means the case is booked and
    // nobody has requested anything for it yet.
    const found = matches[0];
    return NextResponse.json(
      {
        found: false,
        patientExists: true,
        patient: {
          name: found.name,
          folderNumber: found.ptNumber ?? found.folderNumber,
        },
        error: `${found.name ?? "That patient"} is on file, but no ${
          expectedType === "CONSUMABLE"
            ? "consumables have been requested"
            : expectedType === "PHARMACY"
            ? "drugs or dressings have been requested"
            : "anaesthetic prescription has been written"
        } for them yet.`,
      },
      { status: 404 }
    );
  }

  const raw = searchParams.get("code") || "";
  const code = normaliseCode(raw);
  if (!code) {
    return NextResponse.json({ error: "A code is required" }, { status: 400 });
  }

  // 1) Match against the Surgery table (covers consumable, pharmacy and the
  //    elective/emergency anaesthesia codes mirrored onto the surgery).
  const surgery = await prisma.surgery.findFirst({
    where: {
      OR: [
        { consumablePackCode: code },
        { pharmacyDrugCode: code },
        { anaesthesiaDrugCode: code },
      ],
    },
    select: {
      id: true,
      procedureName: true,
      scheduledDate: true,
      scheduledTime: true,
      surgeonName: true,
      surgeryType: true,
      subspecialty: true,
      location: true,
      consumablePackCode: true,
      pharmacyDrugCode: true,
      anaesthesiaDrugCode: true,
      patient: {
        select: {
          name: true,
          folderNumber: true,
          phoneNumber: true,
          caregiverName: true,
          caregiverPhone: true,
        },
      },
    },
  });

  if (surgery) {
    let codeType: "CONSUMABLE" | "PHARMACY" | "ANAESTHESIA";
    let items: any[] = [];

    if (surgery.consumablePackCode === code) {
      codeType = "CONSUMABLE";
      items = await prisma.surgeryConsumableRequest.findMany({
        where: { surgeryId: surgery.id },
        orderBy: { createdAt: "asc" },
      });
    } else if (surgery.pharmacyDrugCode === code) {
      codeType = "PHARMACY";
      items = await prisma.surgeryDrugDressingRequest.findMany({
        where: { surgeryId: surgery.id },
        orderBy: { createdAt: "asc" },
      });
    } else {
      codeType = "ANAESTHESIA";
      items = await prisma.anestheticPrescription.findMany({
        where: { surgeryId: surgery.id },
        orderBy: { createdAt: "asc" },
      });
    }

    return NextResponse.json({
      found: true,
      codeType,
      code,
      codes: codesOf(surgery),
      patient: {
        name: surgery.patient?.name ?? null,
        folderNumber: surgery.patient?.folderNumber ?? null,
        phoneNumber: surgery.patient?.phoneNumber ?? null,
        caregiverName: surgery.patient?.caregiverName ?? null,
        caregiverPhone: surgery.patient?.caregiverPhone ?? null,
      },
      surgery: {
        id: surgery.id,
        procedureName: surgery.procedureName,
        scheduledDate: surgery.scheduledDate,
        scheduledTime: surgery.scheduledTime,
        surgeonName: surgery.surgeonName,
        surgeryType: surgery.surgeryType,
        subspecialty: surgery.subspecialty,
        location: surgery.location,
      },
      items,
    });
  }

  // 2) Fallback: emergency anaesthesia code stored on the emergency prescription.
  const emergencyRx = await prisma.emergencyPrescription.findFirst({
    where: { anaesthesiaDrugCode: code },
    orderBy: { createdAt: "desc" },
  });

  if (emergencyRx) {
    return NextResponse.json({
      found: true,
      codeType: "ANAESTHESIA",
      code,
      // An emergency prescription carries only its own anaesthesia code;
      // there is no surgery row holding a CP or PH code to report.
      codes: { consumable: null, pharmacy: null, anaesthesia: code },
      isEmergency: true,
      patient: {
        name: emergencyRx.patientName ?? null,
        folderNumber: emergencyRx.folderNumber ?? null,
        phoneNumber: null,
        caregiverName: null,
        caregiverPhone: null,
      },
      surgery: null,
      items: [emergencyRx],
    });
  }

  return NextResponse.json(
    { found: false, error: "No surgery found for that code" },
    { status: 404 }
  );
}
