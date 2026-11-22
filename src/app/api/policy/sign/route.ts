/**
 * A committee member reading the revised policy and signing it.
 *
 * Public and token-gated: most of this committee are heads of department who
 * will not register, and a signature that requires an account is a signature
 * that does not arrive.
 *
 * WHY A REFUSAL IS HTTP 200. Somebody whose link was withdrawn, or who has
 * already signed, needs to be told which of those happened in words. A 404
 * leaves the page nothing to say and shows the browser's own error instead,
 * which is how "the link does not work" becomes a phone call to the Chairman.
 * Same as the review link and the patient feedback invite before it.
 *
 * WHAT IS RECORDED AND WHY. The typed name, the drawn signature, and a
 * fingerprint of the exact text that was on screen. The fingerprint is the part
 * that makes the rest mean anything: edit the document afterwards and this
 * signature is reported as standing against an earlier version rather than
 * being carried silently onto words nobody agreed to.
 *
 * WHAT IS DELIBERATELY NOT RECORDED: no IP address and no device fingerprint.
 * They would add nothing a committee could use and would make a signature page
 * into a surveillance record of eleven named colleagues.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import {
  hashSignoffToken,
  outcomeFingerprint,
  signoffState,
  SIGNOFF_PROBLEM_MESSAGE,
} from '@/lib/policy/signoff';
import { signProblem, SIGNATURE_MAX_BYTES } from '@/lib/policy/signature';
import { renderChangeLog, type ChangeLogEntry } from '@/lib/policy/finalProposal';

export const dynamic = 'force-dynamic';

const refuse = (problem: keyof typeof SIGNOFF_PROBLEM_MESSAGE) =>
  NextResponse.json(
    { ok: false, problem, message: SIGNOFF_PROBLEM_MESSAGE[problem] },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );

/** The sign-off row behind a token, with the outcome it points at. */
async function resolve(token: string) {
  const tokenHash = hashSignoffToken(token);
  const row = await prisma.policySignoff.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      roundId: true,
      signerName: true,
      signerRole: true,
      signerUnit: true,
      outcomeVersion: true,
      openedAt: true,
      revokedAt: true,
      signedAt: true,
      signedName: true,
      signedFingerprint: true,
    },
  });
  if (!row) return { row: null, outcome: null, round: null };

  const [outcome, round] = await Promise.all([
    prisma.policyFinalProposal.findFirst({
      where: { roundId: row.roundId },
      orderBy: { generatedAt: 'desc' },
      select: { id: true, version: true, body: true, changeLog: true, generatedAt: true },
    }),
    prisma.policyReviewRound.findUnique({
      where: { id: row.roundId },
      select: { version: true, document: { select: { title: true } } },
    }),
  ]);

  return { row, outcome, round };
}

export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('t') ?? '';
    if (token.trim() === '') return refuse('NOT_FOUND');

    const { row, outcome, round } = await resolve(token);
    const problem = signoffState({ row, hasOutcome: Boolean(outcome) });

    // ALREADY_SIGNED is answered with the document and the signature, not just
    // a refusal: somebody who taps their link again is usually checking that it
    // went through, and showing them their own signature answers that.
    if (problem && problem !== 'ALREADY_SIGNED') return refuse(problem);

    // Opening is recorded once. Overwriting it on every visit would lose the
    // only evidence of when the document first reached them.
    if (row && !row.openedAt) {
      await prisma.policySignoff.update({
        where: { id: row.id },
        data: { openedAt: new Date() },
      });
    }

    const log = Array.isArray(outcome?.changeLog)
      ? (outcome!.changeLog as unknown as ChangeLogEntry[])
      : [];

    return NextResponse.json({
      ok: true,
      alreadySigned: problem === 'ALREADY_SIGNED',
      message: problem === 'ALREADY_SIGNED' ? SIGNOFF_PROBLEM_MESSAGE.ALREADY_SIGNED : null,
      signer: {
        name: row!.signerName,
        role: row!.signerRole,
        unit: row!.signerUnit,
        signedAt: row!.signedAt,
        signedName: row!.signedName,
      },
      policy: {
        title: round?.document?.title ?? 'Theatre policy',
        reviewVersion: round?.version ?? null,
        version: outcome!.version,
        body: outcome!.body,
        changeLog: renderChangeLog(log),
        generatedAt: outcome!.generatedAt,
      },
      maxSignatureBytes: SIGNATURE_MAX_BYTES,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[policy/sign] GET failed', err);
    return NextResponse.json({ error: 'Could not open that link' }, { status: 500 });
  }
}

const postSchema = z.object({
  token: z.string().min(1),
  typedName: z.string().min(1).max(200),
  /** A base64 PNG data URL. The real ceiling is enforced by signProblem. */
  signature: z.string().min(1).max(Math.ceil(SIGNATURE_MAX_BYTES * 1.4)),
  confirmed: z.literal(true),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'That signature could not be read. Please clear the box, sign again and '
            + 'confirm before pressing Sign.',
        },
        { status: 400 },
      );
    }

    const { row, outcome } = await resolve(parsed.data.token);
    const problem = signoffState({ row, hasOutcome: Boolean(outcome) });
    if (problem) return refuse(problem);

    // THE SAME VALIDATION THE PAGE RUNS, run again here. The page's copy is for
    // telling somebody what is wrong while they are looking at it; this one is
    // the rule. A client check is a courtesy, not a gate.
    const bad = signProblem({
      typedName: parsed.data.typedName,
      signature: parsed.data.signature,
      nameOnRecord: row!.signerName,
      confirmed: parsed.data.confirmed,
    });
    if (bad) return NextResponse.json({ ok: false, message: bad }, { status: 400 });

    const signedAt = new Date();
    await prisma.policySignoff.update({
      where: { id: row!.id },
      data: {
        signedAt,
        signedName: parsed.data.typedName.trim(),
        signatureImage: parsed.data.signature,
        // Bound to the text actually on screen, not to the row id: the
        // proposal could be regenerated between the page loading and the
        // signature being given, and this records which words were signed.
        signedFingerprint: outcomeFingerprint(outcome!.body),
        finalProposalId: outcome!.id,
        outcomeVersion: outcome!.version,
      },
    });

    console.info(
      `[policy/sign] ${row!.signerName} signed round ${row!.roundId} `
      + `version ${outcome!.version}`,
    );

    return NextResponse.json({
      ok: true,
      signedAt,
      receipt:
        `Signed by ${parsed.data.typedName.trim()} on `
        + `${signedAt.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
          'Sep', 'Oct', 'Nov', 'Dec'][signedAt.getMonth()]} ${signedAt.getFullYear()}.`,
      message:
        'Thank you. Your signature is on the record and will appear on the signature '
        + 'page of the document that goes to Hospital Management.',
    });
  } catch (err) {
    console.error('[policy/sign] POST failed', err);
    return NextResponse.json({ error: 'Could not record that signature' }, { status: 500 });
  }
}
