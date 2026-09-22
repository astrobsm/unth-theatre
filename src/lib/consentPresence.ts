import prisma from '@/lib/prisma';

/**
 * Does this case have a consent file, without fetching the consent file?
 *
 * WHY THIS EXISTS. Surgery.consentFileData holds the scanned consent as base64
 * TEXT. The sync migration recorded what that costs: the surgeries table is
 * 58 MB for 481 rows, almost entirely these blobs. A scanned A4 page is
 * commonly two to five megabytes once base64 has inflated it by a third.
 *
 * Two screens were selecting that column to compute a single boolean —
 * `!!consentFileData`. The Medical Scribe pulled several megabytes across the
 * wire, on a hospital connection, to decide whether to print one line saying
 * consent was documented. That is the whole of why it took so long to open.
 *
 * This asks the database the question instead of asking for the answer's
 * evidence. `length(...) > 0` runs inside Postgres and returns one boolean per
 * row; nothing large crosses the wire.
 *
 * The routes that genuinely serve the file — consent and consent-form — still
 * select it, and should.
 */

/**
 * The subset of the given ids that actually have consent file bytes.
 *
 * Empty string counts as absent. A column set to '' is what a failed upload
 * leaves behind, and treating it as a consent document on file would be the
 * worst possible direction to be wrong in.
 */
export async function surgeriesWithConsentFile(ids: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Set();

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "surgeries"
      WHERE "id" = ANY(${unique})
        AND "consentFileData" IS NOT NULL
        AND length("consentFileData") > 0
    `;
    return new Set(rows.map((r) => r.id));
  } catch {
    // Fail OPEN as "no file", never as "has one". The callers treat the
    // presence of a file as evidence that consent exists, and inventing that
    // evidence because a query failed would let a case through the safety
    // check on the strength of an error.
    return new Set();
  }
}

/** One case. */
export async function hasConsentFile(surgeryId: string): Promise<boolean> {
  return (await surgeriesWithConsentFile([surgeryId])).has(surgeryId);
}
