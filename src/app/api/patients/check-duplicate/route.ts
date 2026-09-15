import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiMiddleware';
import { shouldHoldRegistration, summarise } from '@/lib/patients/nearMatch';
import { findRegistrationNearMatches } from '@/lib/patients/nearMatchQuery';

export const dynamic = 'force-dynamic';

/**
 * "Is this patient already on file?" — asked while the form is being filled in.
 *
 * WHY A SEPARATE ENDPOINT. The registration form is long, and the guard on
 * POST /api/patients only answers at the end of it. Somebody who has spent four
 * minutes on a pre-operative assessment and is only then told the patient
 * already exists has wasted the four minutes; asked as the folder number is
 * typed, they are told before the work rather than after it.
 *
 * It asks EXACTLY the same question the create will ask, through the same
 * module, so the form cannot say "new patient" about somebody the server will
 * then refuse.
 *
 * A POST rather than a GET, although it only reads: a patient's name and folder
 * number have no business in a URL, a proxy log, or somebody's browser history.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));

  const matches = await findRegistrationNearMatches(
    {
      name: typeof body.name === 'string' ? body.name : '',
      folderNumber: typeof body.folderNumber === 'string' ? body.folderNumber : '',
      ptNumber: typeof body.ptNumber === 'string' ? body.ptNumber : '',
      age: Number.isFinite(Number(body.age)) ? Number(body.age) : null,
      ageUnit: typeof body.ageUnit === 'string' ? body.ageUnit : 'YEARS',
    },
    { excludeId: typeof body.excludeId === 'string' ? body.excludeId : null },
  );

  return NextResponse.json({
    matches,
    hold: shouldHoldRegistration(matches),
    summary: summarise(matches),
  });
}
