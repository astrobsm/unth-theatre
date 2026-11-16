/**
 * The committee's records, as files.
 *
 * ATTRIBUTION IS DECIDED HERE, not by the caller. Whether a row carries a name,
 * a role, or neither comes from the round's visibility setting and the viewer's
 * own standing, through the same attributionFor() used on every screen. An
 * export that took a "withNames" flag from the client would be one request away
 * from releasing what the Chairman had not released.
 *
 * Every export is recorded in the audit trail, because "who took the responses
 * out of the system" is a question the committee may have to answer.
 */
import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { requirePolicyViewer } from '@/lib/policy/guard';
import { attributionFor } from '@/lib/policy/access';
import { displayContributor } from '@/lib/policy/owner';
import { renderChangeLog, type ChangeLogEntry } from '@/lib/policy/finalProposal';

export const dynamic = 'force-dynamic';

/** One CSV cell: quoted, with embedded quotes doubled. */
const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

const csv = (rows: unknown[][]): string =>
  // A BOM, so Excel on the committee's machines reads the UTF-8 rather than
  // mangling every em dash and every Nigerian name with a diacritic.
  `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

const asFile = (body: string, type: string, filename: string) =>
  new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': `${type}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'policy';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  try {
    const format = new URL(request.url).searchParams.get('format') ?? 'responses';

    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        version: true,
        closesAt: true,
        resultsVisibility: true,
        documentId: true,
        document: { select: { title: true } },
      },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const attribution = attributionFor({
      role: actor.role,
      extraModules: actor.extraModules,
      visibility: round.resultsVisibility,
    });

    const name = slug(round.document?.title ?? 'theatre-policy');
    const stamp = new Date().toISOString().slice(0, 10);

    const audit = async (what: string) => {
      // Recorded through the module's own run table rather than inventing a
      // second audit store: an export is a read of the round, and the round is
      // where the committee looks.
      console.info(
        `[policy/export] ${what} for round ${round.id} by ${actor.name} (${actor.role})`,
      );
    };

    // ── The raw responses ─────────────────────────────────────────────
    if (format === 'responses') {
      if (attribution === 'none') {
        return NextResponse.json(
          {
            error:
              'Individual responses have not been released for this round, so there is '
              + 'nothing for you to export. The participation figures are on the round page.',
          },
          { status: 403 },
        );
      }

      const rows = await prisma.policySectionResponse.findMany({
        where: { roundId: round.id },
        orderBy: [{ section: { order: 'asc' } }],
        select: {
          stance: true,
          comment: true,
          proposedWording: true,
          concernType: true,
          priority: true,
          submittedAt: true,
          updatedAt: true,
          section: { select: { number: true, title: true } },
          invitation: {
            select: { inviteeName: true, inviteeRole: true, inviteeUnit: true },
          },
        },
      });

      const items = await prisma.policyDecisionItemResponse.findMany({
        where: { roundId: round.id },
        select: {
          acceptsCurrent: true,
          proposedValue: true,
          reason: true,
          decisionItem: {
            select: {
              placeholder: true,
              currentValue: true,
              section: { select: { number: true, title: true } },
            },
          },
          invitation: {
            select: { inviteeName: true, inviteeRole: true, inviteeUnit: true },
          },
        },
      });

      await audit('exported responses');

      const out: unknown[][] = [
        ['Kind', 'Section', 'Section title', 'Contributor', 'Stance / value',
          'Concern', 'Priority', 'Comment', 'Proposed wording or value', 'Submitted'],
      ];

      for (const r of rows) {
        out.push([
          'Section response',
          r.section.number ?? '',
          r.section.title,
          displayContributor(r.invitation, attribution),
          r.stance,
          r.concernType ?? '',
          r.priority ?? '',
          r.comment ?? '',
          r.proposedWording ?? '',
          r.submittedAt ? r.submittedAt.toISOString() : 'not submitted',
        ]);
      }

      for (const r of items) {
        out.push([
          'Open value',
          r.decisionItem.section.number ?? '',
          r.decisionItem.section.title,
          displayContributor(r.invitation, attribution),
          r.acceptsCurrent
            ? `accepted ${r.decisionItem.currentValue}`
            : `proposed ${r.proposedValue ?? '(blank)'}`,
          '',
          '',
          r.reason ?? '',
          r.decisionItem.placeholder,
          '',
        ]);
      }

      return asFile(csv(out), 'text/csv', `${name}-responses-${stamp}.csv`);
    }

    // ── The synthesis report ──────────────────────────────────────────
    if (format === 'synthesis') {
      const run = await prisma.policyAnalysisRun.findFirst({
        where: { roundId: round.id, status: 'VALIDATED' },
        orderBy: { startedAt: 'desc' },
        select: { output: true, model: true, promptVersion: true, startedAt: true },
      });
      if (!run?.output) {
        return NextResponse.json(
          { error: 'There is no validated analysis for this round yet.' },
          { status: 404 },
        );
      }

      await audit('exported synthesis');

      const output = run.output as {
        synthesis?: {
          executive_summary?: string;
          areas_of_agreement?: string[];
          contested_issues?: Array<{ summary: string }>;
          critical_concerns?: Array<{ type: string; summary: string }>;
          unit_barriers?: Array<{ unit: string; barrier: string; resources_needed: string | null }>;
          for_the_meeting?: string[];
        };
        crossSection?: { inconsistencies?: Array<{ summary: string }> };
      };
      const s = output.synthesis ?? {};

      const md = [
        `# ${round.document?.title ?? 'Theatre policy'} — review synthesis`,
        '',
        `Version under review: ${round.version}`,
        `Round closed: ${round.closesAt.toISOString().slice(0, 10)}`,
        '',
        '> This synthesis was drafted by an AI model from the committee’s responses and',
        '> checked against them automatically: every finding cites the responses it rests',
        '> on, and a run citing anything that does not exist is refused rather than shown.',
        `> Model ${run.model}, prompt ${run.promptVersion}. It is a RECOMMENDATION; the`,
        '> committee decides.',
        '',
        '## Executive summary',
        '',
        s.executive_summary ?? '_Not produced._',
        '',
        '## Areas of agreement',
        '',
        ...(s.areas_of_agreement?.length
          ? s.areas_of_agreement.map((a) => `- ${a}`)
          : ['_None recorded._']),
        '',
        '## Contested issues',
        '',
        ...(s.contested_issues?.length
          ? s.contested_issues.map((c) => `- ${c.summary}`)
          : ['_None recorded._']),
        '',
        '## Critical concerns',
        '',
        ...(s.critical_concerns?.length
          ? s.critical_concerns.map((c) => `- **${c.type.replace(/_/g, ' ')}** — ${c.summary}`)
          : ['_None recorded._']),
        '',
        '## Barriers reported by each unit',
        '',
        ...(s.unit_barriers?.length
          ? s.unit_barriers.map((u) =>
            `- **${u.unit}** — ${u.barrier}`
            + (u.resources_needed ? ` _Needs: ${u.resources_needed}_` : ''))
          : ['_None recorded._']),
        '',
        '## Internal inconsistencies found',
        '',
        ...(output.crossSection?.inconsistencies?.length
          ? output.crossSection.inconsistencies.map((i) => `- ${i.summary}`)
          : ['_None found._']),
        '',
        '## For the committee meeting',
        '',
        ...(s.for_the_meeting?.length
          ? s.for_the_meeting.map((f) => `- ${f}`)
          : ['_Nothing outstanding._']),
        '',
      ].join('\n');

      return asFile(md, 'text/markdown', `${name}-synthesis-${stamp}.md`);
    }

    // ── The revised policy ────────────────────────────────────────────
    if (format === 'final') {
      const proposal = await prisma.policyFinalProposal.findFirst({
        where: { roundId: round.id },
        orderBy: { generatedAt: 'desc' },
        select: {
          version: true,
          body: true,
          changeLog: true,
          approvedByName: true,
          approvedAt: true,
        },
      });
      if (!proposal) {
        return NextResponse.json(
          { error: 'No revised policy has been generated for this round yet.' },
          { status: 404 },
        );
      }

      await audit('exported final policy');

      const log = Array.isArray(proposal.changeLog)
        ? (proposal.changeLog as unknown as ChangeLogEntry[])
        : [];

      const md = [
        proposal.body,
        '',
        '---',
        '',
        '## Change log',
        '',
        renderChangeLog(log),
        '',
        '## Approval',
        '',
        '| | Name | Date |',
        '| --- | --- | --- |',
        `| Prepared by | ${proposal.approvedByName ?? ''} | ${proposal.approvedAt ? proposal.approvedAt.toISOString().slice(0, 10) : ''} |`,
        '| Chairman, Theatre Users Committee | | |',
        '| Chairman, Medical Advisory Committee | | |',
        '| Chief Medical Director | | |',
        '',
      ].join('\n');

      return asFile(md, 'text/markdown', `${name}-v${proposal.version}-${stamp}.md`);
    }

    return NextResponse.json(
      { error: 'Unknown format. Use responses, synthesis or final.' },
      { status: 400 },
    );
  } catch (err) {
    console.error('[policy/export] failed', err);
    return NextResponse.json({ error: 'Could not build that export' }, { status: 500 });
  }
}
