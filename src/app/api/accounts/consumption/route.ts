// ============================================================
// GET /api/accounts/consumption?pt=... — what theatre used, for accounts
// ------------------------------------------------------------
// The hospital accounts department reconciles against the deposits and
// payments it holds. It needs one thing from ORM that it cannot get anywhere
// else: an itemised, priced record of what was actually consumed in theatre
// for a given patient.
//
// Keyed on PT NUMBER, because that is the identifier accounts already works
// in. Making them translate to an internal uuid would put the mapping in two
// systems and guarantee it eventually disagrees.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
//
// It is not a bill, and it must never be mistaken for one. ORM does not
// collect money, does not know what the patient has deposited, and holds no
// balance. It reports what was used and what that is worth at billing prices.
// Accounts sets that against what they hold and produce the bill. Every
// response says so in a `note` field, because a JSON document full of naira
// figures will otherwise be read as an invoice by somebody in a hurry.
//
// ── AUTHENTICATION ──────────────────────────────────────────────────────────
//
// A service token, not a user session. This is a system talking to a system,
// and a session would mean somebody's personal login sitting inside the
// accounts department's integration — expiring at the worst moment and
// attributing every fetch to a person who was not involved.
//
// The same token comparison as the sync service uses: constant-time, with a
// minimum length enforced. A short token on an endpoint that returns patient
// financial data is the kind of thing that is guessed rather than broken.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import { bearerFrom, tokensMatch, MIN_TOKEN_LENGTH } from '@/lib/sync/serviceAuth';
import { buildPatientStatement } from '@/lib/consumption/patientStatement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Roles that may read this through the app rather than the token.
 *
 * Finance staff working inside ORM should not need to hold the integration
 * token to look at one patient, and handing it out so they can is how a
 * service credential ends up in a WhatsApp group.
 */
const MAY_READ_IN_APP = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'PROCUREMENT_OFFICER',
];

async function authorise(request: NextRequest): Promise<
  { ok: true; via: 'token' | 'session' } | { ok: false; status: number; error: string }
> {
  const expected = process.env.ACCOUNTS_API_TOKEN;
  const provided = bearerFrom(request.headers.get('authorization'));

  if (provided) {
    if (!expected) {
      return {
        ok: false, status: 503,
        error: 'The accounts integration is not configured on this deployment.',
      };
    }
    // Refused rather than accepted-with-a-warning. A token too short to be
    // safe is not a weaker credential, it is an absent one.
    if (expected.length < MIN_TOKEN_LENGTH) {
      return {
        ok: false, status: 503,
        error: `ACCOUNTS_API_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters and has been refused.`,
      };
    }
    if (!tokensMatch(provided, expected)) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    return { ok: true, via: 'token' };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!MAY_READ_IN_APP.includes((session.user.role ?? '').toUpperCase())) {
    return { ok: false, status: 403, error: 'Not permitted to read patient consumption.' };
  }
  return { ok: true, via: 'session' };
}

export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const pt = request.nextUrl.searchParams.get('pt')?.trim();
  if (!pt) {
    return NextResponse.json(
      { error: 'Give a PT number: /api/accounts/consumption?pt=PT12345' },
      { status: 400 },
    );
  }

  try {
    const statement = await buildPatientStatement({ ptNumber: pt }, { valuation: 'PATIENT' });

    if (!statement) {
      // Distinguished from a patient with nothing consumed, deliberately. An
      // empty statement for an unknown PT number reads as "this patient used
      // nothing", which would be reconciled against as though it were true.
      return NextResponse.json(
        { error: `No patient with PT number "${pt}".`, code: 'PATIENT_NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...statement,
      currency: 'NGN',
      // Kobo throughout, said explicitly. A consumer that assumes naira is out
      // by a factor of a hundred, and every figure still looks plausible.
      amountUnit: 'kobo',
      readVia: auth.via,
    });
  } catch (error) {
    return apiError('accounts/consumption', error);
  }
}
