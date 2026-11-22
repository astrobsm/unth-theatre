/**
 * Sending the reviewed policy out for signature, and watching them come back.
 *
 * THE LINK IS RETURNED ONCE AND NEVER AGAIN, as with the review invitation:
 * only each token's SHA-256 is stored. The reissue path is here from the first
 * commit, which is the whole lesson of eecc50ae — the review links shipped
 * without one, the screen told the Chairman to use a control that did not
 * exist, and the committee became unreachable. Not twice.
 *
 * WHO IS ASKED is not a parameter. eligibleForSignoff() takes the members who
 * submitted a review, and the route does not accept a list from the client. An
 * endpoint that let the caller name the signatories would be one request away
 * from a signature page listing people who never read the document.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner } from '@/lib/policy/guard';
import {
  buildSignoffMessage,
  eligibleForSignoff,
  newSignoffToken,
  outcomeFingerprint,
  policySignUrl,
  signatureStanding,
  signoffSummary,
  signoffSentence,
  standingLabel,
} from '@/lib/policy/signoff';
import { whatsappLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  signatory: z.string().max(200).nullish(),
  signatoryTitle: z.string().max(200).nullish(),
});

const patchSchema = z.object({
  signoffId: z.string().min(1),
  action: z.enum(['reissue', 'revoke', 'restore']),
  signatory: z.string().max(200).nullish(),
  signatoryTitle: z.string().max(200).nullish(),
});

/** The outcome currently published for this round, and its fingerprint. */
async function currentOutcome(roundId: string) {
  const proposal = await prisma.policyFinalProposal.findFirst({
    where: { roundId },
    orderBy: { generatedAt: 'desc' },
    select: { id: true, version: true, body: true },
  });
  if (!proposal) return null;
  return { ...proposal, fingerprint: outcomeFingerprint(proposal.body) };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  const [rows, invitations, outcome] = await Promise.all([
    prisma.policySignoff.findMany({
      where: { roundId: params.id },
      orderBy: [{ signedAt: 'asc' }, { signerName: 'asc' }],
      select: {
        id: true,
        invitationId: true,
        signerName: true,
        signerRole: true,
        signerUnit: true,
        outcomeVersion: true,
        sentAt: true,
        openedAt: true,
        revokedAt: true,
        signedAt: true,
        signedName: true,
        signedFingerprint: true,
        // Not the image. A list of eleven signatures would carry eleven PNGs
        // into a screen that only needs to say who has signed.
        signatureImage: false,
      },
    }),
    prisma.policyInvitation.findMany({
      where: { roundId: params.id },
      select: { id: true, submittedAt: true, revokedAt: true },
    }),
    currentOutcome(params.id),
  ]);

  const withStanding = rows.map((r) => {
    const standing = signatureStanding({
      revokedAt: r.revokedAt,
      signedAt: r.signedAt,
      signedFingerprint: r.signedFingerprint,
      currentFingerprint: outcome?.fingerprint ?? null,
    });
    return { ...r, standing, standingLabel: standingLabel(standing) };
  });

  const summary = signoffSummary(withStanding.map((r) => r.standing));

  // Participants who should have a link and do not — the Chairman's actual
  // question after somebody submits late.
  const haveLinks = new Set(rows.map((r) => r.invitationId));
  const missing = eligibleForSignoff(invitations).filter((i) => !haveLinks.has(i.id)).length;

  return NextResponse.json({
    signoffs: withStanding,
    summary,
    sentence: signoffSentence(summary),
    outcome: outcome
      ? { id: outcome.id, version: outcome.version, fingerprint: outcome.fingerprint }
      : null,
    eligible: eligibleForSignoff(invitations).length,
    missingLinks: missing,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Could not read that request' }, { status: 400 });
    }

    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: { id: true, document: { select: { title: true } } },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const outcome = await currentOutcome(round.id);
    if (!outcome) {
      // Refusing early and saying why. Issuing links to a document that does
      // not exist yet would have every member open a page telling them to come
      // back later, which is how a committee learns to ignore these links.
      return NextResponse.json(
        {
          error:
            'There is no revised policy to sign yet. Generate the final proposal '
            + 'from the accepted changes first, then send it for signature.',
        },
        { status: 400 },
      );
    }

    const invitations = await prisma.policyInvitation.findMany({
      where: { roundId: round.id },
      select: {
        id: true,
        inviteeName: true,
        inviteeRole: true,
        inviteeUnit: true,
        phone: true,
        submittedAt: true,
        revokedAt: true,
      },
    });

    const eligible = eligibleForSignoff(invitations);
    if (eligible.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nobody has submitted a review, so there is nobody to ask. Only members '
            + 'who reviewed the draft are sent the document to sign.',
        },
        { status: 400 },
      );
    }

    const created: Array<{
      signoffId: string;
      signerName: string;
      url: string;
      message: string;
      whatsapp: string | null;
      alreadySent?: boolean;
    }> = [];

    for (const invitee of eligible) {
      // One link per participant per round, enforced by the unique index. A
      // second press of the button must not mint a second link and silently
      // invalidate the one already in somebody's WhatsApp.
      const existing = await prisma.policySignoff.findUnique({
        where: { roundId_invitationId: { roundId: round.id, invitationId: invitee.id } },
        select: { id: true, signerName: true },
      });
      if (existing) {
        created.push({
          signoffId: existing.id,
          signerName: existing.signerName,
          url: '',
          message: '',
          whatsapp: null,
          alreadySent: true,
        });
        continue;
      }

      const { token, tokenHash } = newSignoffToken();
      const row = await prisma.policySignoff.create({
        data: {
          roundId: round.id,
          invitationId: invitee.id,
          signerName: invitee.inviteeName,
          signerRole: invitee.inviteeRole,
          signerUnit: invitee.inviteeUnit,
          finalProposalId: outcome.id,
          outcomeVersion: outcome.version,
          tokenHash,
          sentAt: new Date(),
        },
        select: { id: true, signerName: true },
      });

      const url = policySignUrl(token);
      const message = buildSignoffMessage({
        url,
        policyTitle: round.document?.title ?? null,
        version: outcome.version,
        signatory: parsed.data.signatory ?? null,
        signatoryTitle: parsed.data.signatoryTitle ?? null,
      });

      created.push({
        signoffId: row.id,
        signerName: row.signerName,
        url,
        message,
        whatsapp: whatsappLink(invitee.phone, message),
      });
    }

    console.info(
      `[policy/signoffs] issued ${created.filter((c) => !c.alreadySent).length} signing `
      + `link(s) for round ${round.id} by ${actor.name} (${actor.role})`,
    );

    return NextResponse.json({
      ok: true,
      created,
      notice:
        'These links are shown once. Only a hash of each is stored, so they cannot be '
        + 'read back later — copy them now, or reissue a link if one is lost.',
    });
  } catch (err) {
    console.error('[policy/signoffs] POST failed', err);
    return NextResponse.json({ error: 'Could not create the signing links' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Could not read that change' }, { status: 400 });
    }

    const row = await prisma.policySignoff.findFirst({
      where: { id: parsed.data.signoffId, roundId: params.id },
      select: {
        id: true,
        signerName: true,
        invitationId: true,
        signedAt: true,
        outcomeVersion: true,
      },
    });
    if (!row) {
      return NextResponse.json({ error: 'No such signing link in this round' }, { status: 404 });
    }

    if (parsed.data.action === 'revoke') {
      await prisma.policySignoff.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      return NextResponse.json({ ok: true, revoked: true });
    }

    if (parsed.data.action === 'restore') {
      await prisma.policySignoff.update({
        where: { id: row.id },
        data: { revokedAt: null },
      });
      return NextResponse.json({ ok: true, revoked: false });
    }

    // Reissue. The old link stops working the instant this is written.
    //
    // A SIGNATURE ALREADY GIVEN IS NOT ERASED. Reissuing is for a lost link,
    // not for undoing an endorsement; clearing signedAt here would let a new
    // link quietly remove a signature from the record, which is not a thing a
    // "resend the link" button should be able to do. Withdrawing the signature
    // is a separate, deliberate act.
    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: { document: { select: { title: true } } },
    });
    const outcome = await currentOutcome(params.id);

    const { token, tokenHash } = newSignoffToken();
    await prisma.policySignoff.update({
      where: { id: row.id },
      data: { tokenHash, revokedAt: null, sentAt: new Date() },
    });

    const invitation = await prisma.policyInvitation.findUnique({
      where: { id: row.invitationId },
      select: { phone: true },
    });

    const url = policySignUrl(token);
    const message = buildSignoffMessage({
      url,
      policyTitle: round?.document?.title ?? null,
      version: outcome?.version ?? row.outcomeVersion ?? '—',
    });

    return NextResponse.json({
      ok: true,
      reissued: true,
      signoffId: row.id,
      signerName: row.signerName,
      url,
      message,
      whatsapp: whatsappLink(invitation?.phone ?? null, message),
      alreadySigned: Boolean(row.signedAt),
      notice: row.signedAt
        ? 'The previous link has stopped working. This member has already signed, and '
          + 'their signature is untouched.'
        : 'The previous link for this member has stopped working.',
    });
  } catch (err) {
    console.error('[policy/signoffs] PATCH failed', err);
    return NextResponse.json({ error: 'Could not change the signing link' }, { status: 500 });
  }
}
