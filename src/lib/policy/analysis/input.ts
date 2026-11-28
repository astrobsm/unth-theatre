// ============================================================
// What leaves the server, and what deliberately does not
// ------------------------------------------------------------
// NO NAMES ARE SENT. The specification permits "names, roles and units of
// reviewers"; this sends role and unit only, and that is a narrowing on
// purpose. A name adds nothing the analysis can use -- it reasons about units
// and professions, and the report it produces should say "the Head of
// Anaesthesia objected" rather than naming a colleague in a document going to
// Management. The Chairman can always see who said what inside ORM, where the
// attribution rules apply.
//
// NO PATIENT DATA EXISTS IN THIS MODULE and none is sent. The only free text
// leaving is what committee members typed about a policy.
//
// RESPONSE IDS ARE REAL DATABASE IDS. They have to be: the whole validation
// step is checking that every citation names a row that exists, and an
// anonymised or renumbered id would make that check meaningless.
// ============================================================

import crypto from 'crypto';

import prisma from '@/lib/prisma';

import { MINIMUM_FOR_ANALYSIS } from './schema';
import type { SectionFacts } from './validate';

export interface SectionInput {
  sectionId: string;
  number: string | null;
  title: string;
  body: string;
  facts: SectionFacts;
  /** The user-message text for this section's call. */
  rendered: string;
  responseCount: number;
}

const unit = (role: string | null, u: string | null): string => {
  const parts = [role, u].map((v) => (v ?? '').trim()).filter((v) => v !== '');
  return parts.length > 0 ? parts.join(', ') : 'Role not stated';
};

/**
 * Assemble one call's input per section, plus the facts to check it against.
 *
 * Sections with no responses at all are returned too, and the caller skips
 * them rather than spending a request to be told there is nothing there.
 */
export async function loadSectionInputs(roundId: string): Promise<SectionInput[]> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: roundId },
    select: { documentId: true },
  });

  const sections = await prisma.policySection.findMany({
    where: { documentId: round.documentId },
    orderBy: [{ order: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      title: true,
      body: true,
      decisionItems: {
        where: { dismissed: false },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          placeholder: true,
          currentValue: true,
          type: true,
          surroundingSentence: true,
        },
      },
    },
  });

  const responses = await prisma.policySectionResponse.findMany({
    where: { roundId },
    select: {
      id: true,
      sectionId: true,
      stance: true,
      comment: true,
      proposedWording: true,
      concernType: true,
      priority: true,
      invitation: { select: { inviteeRole: true, inviteeUnit: true } },
    },
  });

  const itemResponses = await prisma.policyDecisionItemResponse.findMany({
    where: { roundId },
    select: {
      id: true,
      decisionItemId: true,
      acceptsCurrent: true,
      proposedValue: true,
      reason: true,
      invitation: { select: { inviteeRole: true, inviteeUnit: true } },
    },
  });

  return sections.map((section) => {
    const mine = responses.filter((r) => r.sectionId === section.id);
    const itemIds = new Set(section.decisionItems.map((d) => d.id));
    const myItemResponses = itemResponses.filter((r) => itemIds.has(r.decisionItemId));

    const stanceCounts = {
      agree: mine.filter((r) => r.stance === 'AGREE').length,
      agree_with_changes: mine.filter((r) => r.stance === 'AGREE_WITH_CHANGES').length,
      disagree: mine.filter((r) => r.stance === 'DISAGREE').length,
      not_my_area: mine.filter((r) => r.stance === 'NOT_MY_AREA').length,
    };

    const responseIdsByDecisionItem = new Map<string, Set<string>>();
    for (const d of section.decisionItems) {
      responseIdsByDecisionItem.set(
        d.id,
        new Set(myItemResponses.filter((r) => r.decisionItemId === d.id).map((r) => r.id)),
      );
    }

    const facts: SectionFacts = {
      sectionId: section.id,
      // Both kinds of id may be cited, because a proposal for an open value
      // rests on a decision-item response, not on a section response.
      responseIds: new Set([
        ...mine.map((r) => r.id),
        ...myItemResponses.map((r) => r.id),
      ]),
      decisionItemIds: itemIds,
      responseIdsByDecisionItem,
      stanceCounts,
      engagedCount: mine.filter((r) => r.stance !== 'NOT_MY_AREA').length,
      safetyResponseIds: new Set(
        mine.filter((r) => r.concernType === 'PATIENT_SAFETY').map((r) => r.id),
      ),
    };

    const lines: string[] = [
      `SECTION ID: ${section.id}`,
      `SECTION NUMBER: ${section.number ?? '(unnumbered)'}`,
      `SECTION TITLE: ${section.title}`,
      '',
      'SECTION TEXT:',
      section.body.trim() === '' ? '(This heading has no text of its own.)' : section.body,
      '',
      `STANCE COUNTS ON FILE: agree ${stanceCounts.agree}, `
      + `agree_with_changes ${stanceCounts.agree_with_changes}, `
      + `disagree ${stanceCounts.disagree}, not_my_area ${stanceCounts.not_my_area}. `
      + `Engaged (excluding not_my_area): ${facts.engagedCount}.`,
      '',
    ];

    if (section.decisionItems.length > 0) {
      lines.push('OPEN VALUES IN THIS SECTION:');
      for (const d of section.decisionItems) {
        // The ids that answered THIS value, named under it.
        //
        // Without this the model had to work out for itself which of the two
        // id lists below belonged to which open value, and when it guessed
        // wrong the whole run was discarded. Naming them here costs a few
        // tokens and removes the guess.
        const answered = myItemResponses
          .filter((r) => r.decisionItemId === d.id)
          .map((r) => r.id);
        lines.push(
          `- decision_item_id: ${d.id}`,
          `  placeholder: ${d.placeholder}`,
          `  current value as drafted: ${d.currentValue}`,
          `  kind: ${d.type}`,
          `  in context: ${d.surroundingSentence}`,
          `  answered in its own box by: ${answered.length > 0 ? answered.join(', ') : '(nobody)'}`,
        );
      }
      lines.push('');
    }

    lines.push('RESPONSES TO THIS SECTION:');
    if (mine.length === 0) {
      lines.push('(none)');
    } else {
      for (const r of mine) {
        lines.push(
          `- response_id: ${r.id}`,
          `  reviewer: ${unit(r.invitation.inviteeRole, r.invitation.inviteeUnit)}`,
          `  stance: ${r.stance}`,
        );
        if (r.concernType) lines.push(`  concern: ${r.concernType}`);
        if (r.priority) lines.push(`  priority: ${r.priority}`);
        if (r.comment) lines.push(`  comment: ${r.comment}`);
        if (r.proposedWording) {
          lines.push(`  proposed wording: ${r.proposedWording}`);
        }
      }
    }
    lines.push('');

    if (myItemResponses.length > 0) {
      lines.push('RESPONSES TO THE OPEN VALUES:');
      for (const r of myItemResponses) {
        lines.push(
          `- response_id: ${r.id}`,
          `  decision_item_id: ${r.decisionItemId}`,
          `  reviewer: ${unit(r.invitation.inviteeRole, r.invitation.inviteeUnit)}`,
          `  accepts the drafted value: ${r.acceptsCurrent ? 'yes' : 'no'}`,
        );
        if (r.proposedValue) lines.push(`  proposes instead: ${r.proposedValue}`);
        if (r.reason) lines.push(`  reason: ${r.reason}`);
      }
      lines.push('');
    }

    return {
      sectionId: section.id,
      number: section.number,
      title: section.title,
      body: section.body,
      facts,
      rendered: lines.join('\n'),
      responseCount: mine.length,
    };
  });
}

/**
 * A hash of exactly what was analysed.
 *
 * Two runs with the same hash analysed the same input, so "we re-ran it and it
 * said something different" is answerable, and a different hash means the
 * committee answered more in between — which is the usual explanation.
 */
export function inputSnapshotHash(inputs: SectionInput[]): string {
  const h = crypto.createHash('sha256');
  for (const input of inputs) {
    h.update(input.sectionId);
    h.update('\u0000');
    h.update(input.rendered);
    h.update('\u0001');
  }
  return h.digest('hex');
}

/** Sections worth spending a request on. */
export const worthAnalysing = (inputs: SectionInput[]): SectionInput[] =>
  inputs.filter((i) => i.responseCount > 0);

/**
 * The timeline the cross-section pass checks against.
 *
 * Built from the section titles and numbers rather than from a hardcoded list
 * of times, because the times are exactly what the committee is changing.
 */
export function crossSectionInput(opts: {
  sections: SectionInput[];
  analyses: Array<{ sectionId: string; recommendedChanges: string[] }>;
}): string {
  const titleOf = (id: string) => {
    const s = opts.sections.find((x) => x.sectionId === id);
    if (!s) return id;
    return s.number ? `${s.number}. ${s.title}` : s.title;
  };

  const lines = ['THE POLICY, IN ORDER:'];
  for (const s of opts.sections) {
    lines.push(`- ${s.sectionId} = ${s.number ? `${s.number}. ` : ''}${s.title}`);
  }
  lines.push('', 'RECOMMENDED CHANGES, BY SECTION:');

  for (const a of opts.analyses) {
    if (a.recommendedChanges.length === 0) continue;
    lines.push(`- section_id ${a.sectionId} (${titleOf(a.sectionId)}):`);
    for (const change of a.recommendedChanges) lines.push(`    * ${change}`);
  }

  lines.push(
    '',
    `A section with fewer than ${MINIMUM_FOR_ANALYSIS} engaged responses was not `
    + 'analysed and has no recommended changes here.',
  );

  return lines.join('\n');
}
