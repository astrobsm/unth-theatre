import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import { generatePacks } from '@/lib/packs/generate';
import { ANTIBIOTIC_BRANDS, ALTERNATIVE_AGENTS, ETHICON } from '@/lib/packs/standards';

export const dynamic = 'force-dynamic';

/**
 * The standard packs for a procedure, without saving anything.
 *
 * Used at BOOKING, before a surgery row exists — the surgeon picks the
 * procedure and sees the draft immediately, edits it, and it is submitted with
 * the booking. The saved-case path goes through
 * /api/surgeries/[id]/pack/generate, which writes rows.
 *
 * Deterministic and offline: no external call, no database read. The same
 * procedure produces the same draft on the theatre server with the internet
 * down as it does in the cloud.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sp = request.nextUrl.searchParams;
    const procedureName = (sp.get('procedureName') ?? '').trim();

    if (!procedureName) {
      // The reference data on its own, for a screen building its dropdowns
      // before a procedure has been chosen.
      return NextResponse.json({
        brands: ANTIBIOTIC_BRANDS,
        alternativeAgents: ALTERNATIVE_AGENTS,
        sutures: Object.values(ETHICON),
      });
    }

    const age = Number(sp.get('patientAge'));

    const packs = generatePacks({
      procedureName,
      subspecialty: sp.get('subspecialty'),
      magnitude: sp.get('magnitude'),
      surgeryType: sp.get('surgeryType'),
      additionalProcedures: sp.get('additionalProcedures'),
      patientAge: Number.isFinite(age) ? age : null,
      patientAgeUnit: sp.get('patientAgeUnit'),
      betaLactamAllergy: sp.get('betaLactamAllergy') === 'true',
    });

    return NextResponse.json({
      ...packs,
      // The brand list travels with the pack so the dropdown beside each
      // antibiotic is populated without a second request.
      brands: ANTIBIOTIC_BRANDS,
      alternativeAgents: ALTERNATIVE_AGENTS,
    });
  } catch (error) {
    return apiError('packs/standards GET', error);
  }
}
