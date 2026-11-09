// ============================================================
// Opening an anonymous feedback invitation — PUBLIC, no sign-in
// ------------------------------------------------------------
// The patient taps a link on their phone. This says whether the invitation is
// usable and what the form should show.
//
// WHAT IT RETURNS IS THE WHOLE POINT. Not the patient's name, not their folder
// number, not their procedure — only whether the link works, which unit cared
// for them, and the plain statement of what the hospital will and will not
// know. Anything else here would be handed to whoever is holding the phone,
// and the page is open to the internet.
//
// It is also why this is a separate endpoint from the staff one: there is no
// session to check, so there must be nothing here worth stealing. A token
// bought by brute force would buy its holder the name of a surgical unit.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import {
  hashInviteToken, inviteState, ANONYMITY_NOTICE,
} from '@/lib/patients/feedbackInvite';

// A Next route module may only export route handlers and a few known config
// values, so ANONYMITY_NOTICE lives in lib/patients/feedbackInvite.ts — which
// is the better home anyway: the promise sits beside the code that keeps it.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('t') ?? '';
    if (!token.trim()) {
      return NextResponse.json({ error: 'No invitation was given.' }, { status: 400 });
    }

    const row = await prisma.feedbackRequest.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      select: { id: true, expiresAt: true, submittedAt: true, surgeryId: true },
    });

    const state = inviteState(row);
    if (!state.ok) {
      // 200, not 404. This is a patient reading a page, not a program handling
      // an error, and the page has something to say in every one of these
      // cases — including "the ordinary form is still open to you".
      return NextResponse.json({ ok: false, problem: state.problem, message: state.message });
    }

    // The unit, so the patient can see their feedback is going somewhere, and
    // so the form can attach it. Read through the surgery rather than stored
    // on the request row, because the row is about to lose its surgeryId.
    let unit: string | null = null;
    if (row!.surgeryId) {
      const s = await prisma.surgery.findUnique({
        where: { id: row!.surgeryId },
        select: { unit: true },
      }).catch(() => null);
      unit = s?.unit ?? null;
    }

    return NextResponse.json({ ok: true, unit, anonymity: ANONYMITY_NOTICE });
  } catch (error) {
    return apiError('feedback/invite GET', error);
  }
}
