import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normaliseCode } from "@/lib/surgeryCodes";

export const dynamic = "force-dynamic";

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
    const patientWhere = {
      OR: [
        { folderNumber: { equals: patientIdentifier, mode: "insensitive" as const } },
        { ptNumber: { equals: patientIdentifier, mode: "insensitive" as const } },
      ],
    };

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
          code: latestRequest.surgery.consumablePackCode ?? patientIdentifier,
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
              pharmacyDrugCode: true,
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
          code: latestRequest.surgery.pharmacyDrugCode ?? patientIdentifier,
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
              anaesthesiaDrugCode: true,
            },
          },
        },
      });

      if (latestPrescription) {
        return NextResponse.json({
          found: true,
          codeType: "ANAESTHESIA",
          code: latestPrescription.surgery?.anaesthesiaDrugCode ?? patientIdentifier,
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

    return NextResponse.json(
      {
        found: false,
        error: `No ${
          expectedType === "CONSUMABLE"
            ? "consumable request"
            : expectedType === "PHARMACY"
            ? "pharmacy request"
            : "anaesthesia prescription"
        } found for that PT number`,
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
