// ============================================================
// Asking the other database whether it already knows this patient
// ------------------------------------------------------------
// The duplicate that took a case out of theatre on 20 August was created
// because registration checks for an existing folder number ON ITS OWN NODE
// ONLY. Two nodes, six minutes apart, both concluded the patient was new.
//
// So before minting a UUID, the node asks its peer. If the peer already knows
// this folder number, the patient is created HERE UNDER THE PEER'S ID, and the
// two databases agree from the first moment. The row then replicates as an
// ordinary update rather than as a collision that can never resolve.
//
// THIS MUST NEVER PREVENT A REGISTRATION.
//
// The hospital has to work when the internet does not — that is the whole point
// of the local server. So this is best-effort with a short deadline, and every
// failure path returns "don't know" rather than throwing. A patient standing at
// a desk is not made to wait on a link to Frankfurt, and is never turned away
// because of one.
//
// Direction: only the theatre server can do this. It holds CLOUD_DIRECT_URL and
// can reach the cloud; the cloud has no route back through carrier-grade NAT.
// A duplicate created cloud-side is therefore still possible, and is caught by
// scripts/local-server/check-identity-divergence.sh rather than here — stated
// plainly because a half-closed trap that is believed closed is worse than an
// open one.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { normaliseIdentifier } from './identity';

/** Long enough for a working link, short enough not to be felt at a desk. */
const PEER_TIMEOUT_MS = 2_500;

let peerClient: PrismaClient | null | undefined;

/**
 * A client for the peer database, or null when there is no distinct peer.
 *
 * Built once. Returns null on the cloud, where CLOUD_DIRECT_URL either is not
 * set or points at the database we are already talking to — asking ourselves
 * whether we know a patient is a round trip to learn nothing.
 */
function getPeerClient(): PrismaClient | null {
  if (peerClient !== undefined) return peerClient;

  const url = process.env.CLOUD_DIRECT_URL;
  const own = process.env.DATABASE_URL;
  const strip = (u?: string) => (u ?? '').split('?')[0];

  if (!url || strip(url) === strip(own)) {
    peerClient = null;
    return null;
  }

  try {
    peerClient = new PrismaClient({ datasources: { db: { url } } });
  } catch {
    peerClient = null;
  }
  return peerClient;
}

export interface PeerPatient {
  id: string;
  name: string;
  folderNumber: string;
  ptNumber: string | null;
}

/**
 * The peer's record for this folder or PT number, if it has one.
 *
 * Matched on the NORMALISED identifier, so "914 954" here finds "914954"
 * there — the whitespace variants are the trap this exists to close.
 *
 * Returns null for "no match" AND for "could not ask". The caller cannot tell
 * them apart, deliberately: both mean "carry on and register", and inventing a
 * distinction would tempt somebody to block on the second.
 */
export async function findPeerPatient(
  folderNumber: string | null | undefined,
  ptNumber: string | null | undefined,
): Promise<PeerPatient | null> {
  const client = getPeerClient();
  if (!client) return null;

  const folder = normaliseIdentifier(folderNumber);
  const pt = normaliseIdentifier(ptNumber);
  if (!folder && !pt) return null;

  const query = client.$queryRawUnsafe<PeerPatient[]>(
    `select id, name, "folderNumber", "ptNumber"
       from patients
      where ($1 <> '' and regexp_replace(upper("folderNumber"), '\\s', '', 'g') = $1)
         or ($2 <> '' and "ptNumber" is not null
             and regexp_replace(upper("ptNumber"), '\\s', '', 'g') = $2)
      limit 1`,
    folder,
    pt,
  );

  // Raced rather than relying on a connection timeout: a TCP connection that is
  // open but silent does not time out, and that is precisely what a hospital
  // uplink does. The same failure mode as the booking form's "Scheduling…"
  // hang, in a place where it would stall patient registration.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PEER_TIMEOUT_MS));

  try {
    const rows = await Promise.race([query, timeout]);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (e) {
    console.warn('[patients] peer identity check unavailable:', (e as Error)?.message);
    return null;
  }
}
