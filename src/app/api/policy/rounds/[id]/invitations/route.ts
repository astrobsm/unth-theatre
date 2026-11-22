/**
 * Who is invited, and the personal links that reach them.
 *
 * THE LINK IS RETURNED ONCE AND NEVER AGAIN. Only the token's SHA-256 is
 * stored, so there is no query that can produce a member's link later — not for
 * the Chairman, and not for anybody who gets hold of a database backup. That is
 * the point of hashing it.
 *
 * The practical consequence is that losing a link means REISSUING it, which is
 * supported here and invalidates the old one. The alternative — storing the
 * token so it can be re-read — would mean a leaked backup could answer in a
 * head of department's name on a policy that goes to Management.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner } from '@/lib/policy/guard';
import {
  buildPolicyInviteMessage,
  inviteExpiryFor,
  newPolicyInviteToken,
  policyInviteUrl,
} from '@/lib/policy/invite';
import { whatsappLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const inviteeSchema = z.object({
  inviteeName: z.string().min(2).max(200),
  inviteeRole: z.string().max(200).nullish(),
  inviteeUnit: z.string().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().email().max(200).nullish().or(z.literal('')),
  /** Where the member already has an ORM account, link the two. */
  userId: z.string().max(80).nullish(),
});

const postSchema = z.object({
  invitees: z.array(inviteeSchema).min(1).max(100),
  signatory: z.string().max(200).nullish(),
  signatoryTitle: z.string().max(200).nullish(),
});

const patchSchema = z.object({
  invitationId: z.string().min(1),
  action: z.enum(['revoke', 'restore', 'reissue']),
  signatory: z.string().max(200).nullish(),
  signatoryTitle: z.string().max(200).nullish(),
});

const clean = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t.slice(0, max);
};

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  // How far each member has got. The Remind button says so in the message,
  // and the list shows it, because "7 of 22" is the difference between
  // chasing somebody who is working on it and chasing somebody who is not.
  const [answeredRows, totalSections] = await Promise.all([
    prisma.policySectionResponse.groupBy({
      by: ['invitationId'],
      where: { roundId: params.id },
      _count: { _all: true },
    }),
    prisma.policySection.count({
      where: { document: { rounds: { some: { id: params.id } } } },
    }),
  ]);
  const answeredBy = new Map<string, number>(
    answeredRows.map((a) => [a.invitationId, a._count._all]),
  );

  const invitations = await prisma.policyInvitation.findMany({
    where: { roundId: params.id },
    orderBy: [{ inviteeUnit: 'asc' }, { inviteeName: 'asc' }],
    select: {
      id: true,
      inviteeName: true,
      inviteeRole: true,
      inviteeUnit: true,
      phone: true,
      email: true,
      userId: true,
      selfEnrolled: true,
      sentAt: true,
      openedAt: true,
      submittedAt: true,
      revokedAt: true,
      reminderCount: true,
      remindedAt: true,
      participation: { select: { lastSeenAt: true, currentStepId: true } },
      // No tokenHash, and certainly no token. The hash is of no use to a
      // screen and sending it would only invite somebody to try to reverse it.
    },
  });

  return NextResponse.json(
    {
      invitations: invitations.map((i) => ({
        ...i,
        answered: answeredBy.get(i.id) ?? 0,
      })),
      totalSections,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Could not read that list', detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: { id: true, closesAt: true, document: { select: { title: true } } },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const created: Array<{
      invitationId: string;
      inviteeName: string;
      url: string;
      message: string;
      whatsapp: string | null;
      alreadyInvited?: boolean;
    }> = [];

    for (const invitee of parsed.data.invitees) {
      const userId = clean(invitee.userId, 80);

      // One invitation per account per round, enforced by the unique index.
      // Re-sending somebody's name must not create a second row, or the
      // participation figures count them twice and they get two links.
      if (userId) {
        const existing = await prisma.policyInvitation.findUnique({
          where: { roundId_userId: { roundId: round.id, userId } },
          select: { id: true, inviteeName: true },
        });
        if (existing) {
          created.push({
            invitationId: existing.id,
            inviteeName: existing.inviteeName,
            url: '',
            message: '',
            whatsapp: null,
            alreadyInvited: true,
          });
          continue;
        }
      }

      const { token, tokenHash } = newPolicyInviteToken();
      const row = await prisma.policyInvitation.create({
        data: {
          roundId: round.id,
          userId,
          inviteeName: invitee.inviteeName.trim(),
          inviteeRole: clean(invitee.inviteeRole, 200),
          inviteeUnit: clean(invitee.inviteeUnit, 200),
          phone: clean(invitee.phone, 40),
          email: clean(invitee.email, 200),
          tokenHash,
          expiresAt: inviteExpiryFor(round.closesAt),
          sentAt: new Date(),
        },
        select: { id: true, inviteeName: true, phone: true },
      });

      const url = policyInviteUrl(token);
      const message = buildPolicyInviteMessage({
        url,
        inviteeName: row.inviteeName,
        closesAt: round.closesAt,
        policyTitle: round.document?.title ?? null,
        signatory: parsed.data.signatory ?? null,
        signatoryTitle: parsed.data.signatoryTitle ?? null,
      });

      created.push({
        invitationId: row.id,
        inviteeName: row.inviteeName,
        url,
        message,
        whatsapp: whatsappLink(row.phone, message),
      });
    }

    return NextResponse.json({
      ok: true,
      created,
      notice:
        'These links are shown once. Only a hash of each is stored, so they cannot be '
        + 'read back later — copy them now, or reissue a link if one is lost.',
    });
  } catch (err) {
    console.error('[policy/invitations] POST failed', err);
    return NextResponse.json({ error: 'Could not create the invitations' }, { status: 500 });
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

    const invitation = await prisma.policyInvitation.findFirst({
      where: { id: parsed.data.invitationId, roundId: params.id },
      select: {
        id: true,
        inviteeName: true,
        phone: true,
        round: { select: { closesAt: true, document: { select: { title: true } } } },
      },
    });
    if (!invitation) {
      return NextResponse.json({ error: 'No such invitation in this round' }, { status: 404 });
    }

    if (parsed.data.action === 'revoke') {
      await prisma.policyInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
      return NextResponse.json({ ok: true, revoked: true });
    }

    if (parsed.data.action === 'restore') {
      await prisma.policyInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: null },
      });
      return NextResponse.json({ ok: true, revoked: false });
    }

    // Reissue: a new token, and the old link stops working the moment this is
    // written. Anything the member already answered is untouched — the
    // responses hang off the invitation, not off the token.
    const { token, tokenHash } = newPolicyInviteToken();
    await prisma.policyInvitation.update({
      where: { id: invitation.id },
      data: { tokenHash, revokedAt: null, sentAt: new Date() },
    });

    const url = policyInviteUrl(token);
    const message = buildPolicyInviteMessage({
      url,
      inviteeName: invitation.inviteeName,
      closesAt: invitation.round.closesAt,
      policyTitle: invitation.round.document?.title ?? null,
      signatory: parsed.data.signatory ?? null,
      signatoryTitle: parsed.data.signatoryTitle ?? null,
    });

    return NextResponse.json({
      ok: true,
      reissued: true,
      invitationId: invitation.id,
      inviteeName: invitation.inviteeName,
      url,
      message,
      whatsapp: whatsappLink(invitation.phone, message),
      notice: 'The previous link for this member has stopped working.',
    });
  } catch (err) {
    console.error('[policy/invitations] PATCH failed', err);
    return NextResponse.json({ error: 'Could not change the invitation' }, { status: 500 });
  }
}
