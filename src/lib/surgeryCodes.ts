// ============================================================
// Surgery patient-facing codes
// Short, human-typable codes the patient carries to a provider:
//   CP-XXXXXX  Consumable Pack code  (consumable pack provider)
//   PH-XXXXXX  Pharmacy Drug code    (pharmacy packing)
//   AN-XXXXXX  Anaesthesia Drug code (after the anaesthetist prescribes)
// ============================================================

import type { PrismaClient } from '@prisma/client';

// Unambiguous alphabet — excludes 0/O, 1/I/L so codes are easy to read aloud
// and type without confusion.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CODE_PREFIX = {
  consumable: 'CP',
  pharmacy: 'PH',
  anaesthesia: 'AN',
} as const;

export type SurgeryCodeType = keyof typeof CODE_PREFIX;

function randomBody(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Build a single formatted code, e.g. "CP-7K9QF2". */
export function buildCode(type: SurgeryCodeType): string {
  return `${CODE_PREFIX[type]}-${randomBody(6)}`;
}

/** Normalise a user-typed code: trim, uppercase, collapse spaces. */
export function normaliseCode(input: string): string {
  return (input || '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Generate a code that does not already exist on the surgeries table for the
 * given field. Retries a few times before giving up (collisions are extremely
 * unlikely with ~30^6 combinations).
 */
export async function generateUniqueSurgeryCode(
  prisma: PrismaClient,
  field: 'consumablePackCode' | 'pharmacyDrugCode' | 'anaesthesiaDrugCode',
  type: SurgeryCodeType
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = buildCode(type);
    const existing = await prisma.surgery.findFirst({
      where: { [field]: code } as any,
      select: { id: true },
    });
    if (!existing) return code;
  }
  // Fallback: append more entropy
  return `${CODE_PREFIX[type]}-${randomBody(9)}`;
}

/**
 * Ensure the surgery has an anaesthesia drug code. Generates and persists one
 * if absent, then returns it. Safe to call multiple times (idempotent).
 */
export async function ensureAnaesthesiaCodeForSurgery(
  prisma: PrismaClient,
  surgeryId: string
): Promise<string | null> {
  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: { id: true, anaesthesiaDrugCode: true },
    });
    if (!surgery) return null;
    if (surgery.anaesthesiaDrugCode) return surgery.anaesthesiaDrugCode;

    const code = await generateUniqueSurgeryCode(prisma, 'anaesthesiaDrugCode', 'anaesthesia');
    await prisma.surgery.update({
      where: { id: surgeryId },
      data: { anaesthesiaDrugCode: code },
    });
    return code;
  } catch {
    return null;
  }
}

/**
 * Generate a unique anaesthesia code for the emergency-prescription table.
 */
export async function generateUniqueEmergencyAnaesthesiaCode(
  prisma: PrismaClient
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = buildCode('anaesthesia');
    const existing = await prisma.emergencyPrescription.findFirst({
      where: { anaesthesiaDrugCode: code } as any,
      select: { id: true },
    });
    if (!existing) return code;
  }
  return `${CODE_PREFIX.anaesthesia}-${randomBody(9)}`;
}
