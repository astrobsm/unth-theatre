/**
 * A seeded policy review, for exercising the analysis without waiting for a
 * real committee.
 *
 * Run:  npx tsx scripts/seed-policy-review-demo.ts --yes
 *
 * EVERY NAME HERE IS INVENTED. The real Theatre Users Committee roster -- names
 * and WhatsApp numbers of actual heads of department -- stays out of this
 * repository, which is why the invite screen takes a pasted list at run time
 * rather than reading one from a file. "Dr A. Example" is not a person.
 *
 * It plants the three scenarios the specification asks to be verified, so a run
 * of the analysis can be checked against known answers rather than against
 * whatever the model happens to say:
 *
 *   1. A LONE PATIENT-SAFETY OBJECTION. One consultant anaesthetist, alone,
 *      says a proposed cut-off is unsafe, on a section where everybody else
 *      agrees. The analysis must report it as its own critical concern and must
 *      NOT describe it as a minority view the majority settles.
 *
 *   2. A CONFLICT BETWEEN ANAESTHESIA AND THE LABORATORY on the results upload
 *      time. Both are reasonable, they are incompatible, and the analysis must
 *      state it neutrally rather than siding with either.
 *
 *   3. TWO COMPETING VALUES FOR ONE OPEN VALUE. Three reviewers want 14:00,
 *      two want 12:00. The analysis must report both with their real support,
 *      and the counts must match this seed exactly.
 *
 * It also seeds a section with ONE response, which must come back as
 * "insufficient_input" rather than as a recommendation drawn from one voice.
 */

import crypto from 'crypto';

import prisma from '../src/lib/prisma';

const DEMO_TITLE = '[DEMO] UNTH Theatre Operational Flow Policy';

const SECTIONS = [
  {
    key: 's1',
    number: '1',
    title: 'Purpose, scope and guiding principles',
    body:
      'This policy governs the booking, preparation, investigation and cancellation of '
      + 'operations in the Theatre Complex. It applies to all elective and emergency cases.',
  },
  {
    key: 's4',
    number: '4',
    title: 'Weekly rosters and booking windows',
    body:
      'Elective lists close at [15:30] on the working day before surgery. A case booked '
      + 'after the cut-off joins the standby list and is operated only if a slot is '
      + 'released.',
  },
  {
    key: 's5',
    number: '5',
    title: 'Perioperative laboratory and imaging service',
    body:
      'All results required for a listed case must be uploaded to ORM by [11:00] on the '
      + 'day before surgery, so that the pre-anaesthetic review at 15:30 has a complete '
      + 'record. A case without complete results is reviewed as incomplete.',
  },
  {
    key: 's10',
    number: '10',
    title: 'Valid and invalid reasons for cancellation',
    body:
      'A case may be cancelled for clinical unsuitability, a failed consent process, or '
      + 'the unavailability of an essential consumable. The anaesthetist may decline any '
      + 'case they judge unsafe, and that judgement is final.',
  },
  {
    key: 's15',
    number: '15',
    title: 'Monitoring, KPIs and reporting',
    body:
      'The committee reviews on-time starts monthly, with a target of [80%] of first '
      + 'cases starting at the scheduled time.',
  },
];

/** Twelve invented committee members across the units that matter. */
const REVIEWERS = [
  { name: 'Dr A. Example', role: 'Head of Surgery', unit: 'Surgery' },
  { name: 'Dr B. Example', role: 'Head of Anaesthesia', unit: 'Anaesthesia' },
  { name: 'Dr C. Example', role: 'Consultant Anaesthetist', unit: 'Anaesthesia' },
  { name: 'Mrs D. Example', role: 'Head of Nursing Services', unit: 'Nursing' },
  { name: 'Mr E. Example', role: 'Head of Pharmacy', unit: 'Pharmacy' },
  { name: 'Mr F. Example', role: 'Head of Laboratory Services', unit: 'Laboratory' },
  { name: 'Mr G. Example', role: 'Chemical Pathology Scientist', unit: 'Laboratory' },
  { name: 'Dr H. Example', role: 'Head of Radiology', unit: 'Radiology' },
  { name: 'Mrs I. Example', role: 'Theatre Manager (Main)', unit: 'Theatre Complex' },
  { name: 'Mr J. Example', role: 'Theatre Manager (A&E)', unit: 'Theatre Complex' },
  { name: 'Dr K. Example', role: 'Unit Representative', unit: 'Orthopaedics' },
  { name: 'Dr L. Example', role: 'Unit Representative', unit: 'Obstetrics and Gynaecology' },
] as const;

type Stance = 'AGREE' | 'AGREE_WITH_CHANGES' | 'DISAGREE' | 'NOT_MY_AREA';

interface SeedResponse {
  reviewer: number;
  section: string;
  stance: Stance;
  comment?: string;
  proposedWording?: string;
  concernType?: 'PATIENT_SAFETY' | 'FEASIBILITY' | 'RESOURCES' | 'LEGAL_OR_DISCIPLINARY' | 'CLARITY' | 'OTHER';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

const RESPONSES: SeedResponse[] = [
  // ── Section 1: broad agreement, nothing to see ──────────────────────
  ...[0, 1, 3, 4, 5, 8].map((reviewer) => ({
    reviewer, section: 's1', stance: 'AGREE' as Stance,
  })),
  { reviewer: 7, section: 's1', stance: 'NOT_MY_AREA' },

  // ── Section 4: SCENARIO 1 — a lone patient-safety objection ─────────
  { reviewer: 0, section: 's4', stance: 'AGREE', comment: 'The cut-off is workable for elective lists.' },
  { reviewer: 3, section: 's4', stance: 'AGREE', comment: 'Nursing can prepare by then.' },
  { reviewer: 8, section: 's4', stance: 'AGREE', comment: 'Works for the main theatre.' },
  { reviewer: 9, section: 's4', stance: 'AGREE' },
  { reviewer: 10, section: 's4', stance: 'AGREE', comment: 'No objection from orthopaedics.' },
  {
    // The one that must not scroll away.
    reviewer: 2,
    section: 's4',
    stance: 'DISAGREE',
    concernType: 'PATIENT_SAFETY',
    priority: 'HIGH',
    comment:
      'A hard 15:30 cut-off with no clinical override will push genuinely urgent cases '
      + 'onto a standby list that frequently does not run. I have seen a strangulated '
      + 'hernia wait a day because it missed the window by twenty minutes. There must be '
      + 'a named consultant able to add an urgent case after the cut-off.',
    proposedWording:
      'Elective lists close at 15:30 on the working day before surgery. A case booked '
      + 'after the cut-off joins the standby list, EXCEPT where a consultant surgeon and '
      + 'the duty anaesthetist jointly judge the case to be urgent, in which case it is '
      + 'added to the list and the reason recorded in ORM.',
  },

  // ── Section 5: SCENARIO 2 — Anaesthesia against the Laboratory ──────
  {
    reviewer: 1,
    section: 's5',
    stance: 'AGREE',
    comment:
      'The 11:00 upload is the whole point. The pre-anaesthetic review starts at 15:30 '
      + 'and we cannot review a case with no results. If anything it should be earlier.',
  },
  {
    reviewer: 2,
    section: 's5',
    stance: 'AGREE',
    comment: 'Agreed. Reviewing an incomplete case wastes the slot and the patient’s day.',
  },
  {
    reviewer: 5,
    section: 's5',
    stance: 'DISAGREE',
    concernType: 'FEASIBILITY',
    priority: 'HIGH',
    comment:
      'An 11:00 deadline is not achievable. Samples for next-day lists reach us between '
      + '09:00 and 11:00, and the chemistry analyser run takes two hours. We would miss '
      + 'the deadline on most lists and be recorded as the cause of incomplete reviews '
      + 'for work we physically cannot finish earlier.',
    proposedWording:
      'All results required for a listed case must be uploaded to ORM by 14:00 on the day '
      + 'before surgery.',
  },
  {
    reviewer: 6,
    section: 's5',
    stance: 'AGREE_WITH_CHANGES',
    concernType: 'RESOURCES',
    priority: 'MEDIUM',
    comment:
      'Achievable only with a second analyser run in the morning, which needs reagents we '
      + 'do not currently stock at that volume.',
  },
  {
    reviewer: 7,
    section: 's5',
    stance: 'AGREE_WITH_CHANGES',
    comment: 'Imaging can meet 11:00 for plain films; CT reporting cannot.',
  },
  { reviewer: 8, section: 's5', stance: 'AGREE', comment: 'Theatre needs the results early.' },

  // ── Section 10: a clinical provision somebody wants weakened ────────
  {
    reviewer: 0,
    section: 's10',
    stance: 'AGREE_WITH_CHANGES',
    concernType: 'OTHER',
    priority: 'MEDIUM',
    comment:
      'The anaesthetist’s veto should be discussed with the operating surgeon before it '
      + 'is final, rather than simply declared.',
    proposedWording:
      'The anaesthetist may decline any case they judge unsafe, after discussion with the '
      + 'operating surgeon and the theatre manager.',
  },
  {
    reviewer: 1,
    section: 's10',
    stance: 'DISAGREE',
    concernType: 'PATIENT_SAFETY',
    priority: 'HIGH',
    comment:
      'The right to decline an unsafe case cannot be made conditional on anybody’s '
      + 'agreement. That is the one provision in this policy that must not move.',
  },
  { reviewer: 2, section: 's10', stance: 'AGREE' },
  { reviewer: 3, section: 's10', stance: 'AGREE' },
  { reviewer: 8, section: 's10', stance: 'AGREE' },

  // ── Section 15: ONE response, so it must read as insufficient ───────
  {
    reviewer: 8,
    section: 's15',
    stance: 'AGREE_WITH_CHANGES',
    comment: '80% is ambitious before the porter rota is fixed.',
  },
];

/** SCENARIO 3 — two competing values for the 11:00 upload deadline. */
const ITEM_RESPONSES = [
  { reviewer: 5, placeholder: '[11:00]', accepts: false, value: '14:00', reason: 'Analyser run takes two hours after the last samples arrive.' },
  { reviewer: 6, placeholder: '[11:00]', accepts: false, value: '14:00', reason: 'Same reason; 14:00 is achievable without new reagents.' },
  { reviewer: 7, placeholder: '[11:00]', accepts: false, value: '14:00', reason: 'CT reporting cannot be guaranteed before early afternoon.' },
  { reviewer: 8, placeholder: '[11:00]', accepts: false, value: '12:00', reason: 'A compromise that still leaves theatre time to chase gaps.' },
  { reviewer: 9, placeholder: '[11:00]', accepts: false, value: '12:00', reason: 'Noon works for us.' },
  { reviewer: 1, placeholder: '[11:00]', accepts: true, reason: 'The review starts at 15:30 and needs the time.' },
  { reviewer: 2, placeholder: '[11:00]', accepts: true, reason: 'Keep it at 11:00.' },

  { reviewer: 0, placeholder: '[15:30]', accepts: true, reason: 'Fine as drafted.' },
  { reviewer: 2, placeholder: '[15:30]', accepts: false, value: '15:30 with a consultant override', reason: 'See my comment on section 4.' },

  { reviewer: 8, placeholder: '[80%]', accepts: false, value: '70%', reason: 'Start lower and raise it once the porter rota is fixed.' },
];

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log(
      [
        'This creates a DEMO policy review with 12 invented reviewers.',
        '',
        `It will REPLACE any existing document titled "${DEMO_TITLE}".`,
        'Nothing belonging to a real round is touched.',
        '',
        'Re-run with --yes to go ahead.',
      ].join('\n'),
    );
    return;
  }

  const existing = await prisma.policyDocument.findFirst({
    where: { title: DEMO_TITLE },
    select: { id: true },
  });
  if (existing) {
    // Cascades through sections, items, rounds, invitations and responses.
    await prisma.policyDocument.delete({ where: { id: existing.id } });
    console.log('Removed the previous demo document.');
  }

  const document = await prisma.policyDocument.create({
    data: {
      title: DEMO_TITLE,
      version: '0.2',
      sourceFormat: 'MARKDOWN',
      sourceFileName: 'seeded-demo.md',
      importedByName: 'Seed script',
      status: 'UNDER_REVIEW',
    },
  });

  const sectionIds = new Map<string, string>();
  // Indexed loops, not `.entries()`: this project's TS target predates
  // downlevelIteration, so iterating an array iterator does not compile.
  for (let i = 0; i < SECTIONS.length; i += 1) {
    const section = SECTIONS[i];
    const row = await prisma.policySection.create({
      data: {
        documentId: document.id,
        number: section.number,
        title: section.title,
        order: i,
        body: section.body,
      },
    });
    sectionIds.set(section.key, row.id);

    // The [bracketed] values, found the same way the importer finds them.
    const matches = section.body.match(/\[[^\]\n]+\]/g) ?? [];
    for (let j = 0; j < matches.length; j += 1) {
      const placeholder = matches[j];
      const value = placeholder.slice(1, -1);
      await prisma.policyDecisionItem.create({
        data: {
          sectionId: row.id,
          placeholder,
          currentValue: value,
          surroundingSentence: section.body,
          type: /^\d{1,2}:\d{2}$/.test(value)
            ? 'TIME'
            : /%$/.test(value) ? 'PERCENTAGE' : 'FREE_TEXT',
          order: j,
        },
      });
    }
  }

  const closesAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const round = await prisma.policyReviewRound.create({
    data: {
      documentId: document.id,
      version: document.version,
      title: '[DEMO] First committee review',
      status: 'OPEN',
      opensAt: new Date(),
      closesAt,
      createdByName: 'Seed script',
    },
  });

  const invitationIds: string[] = [];
  for (const reviewer of REVIEWERS) {
    const row = await prisma.policyInvitation.create({
      data: {
        roundId: round.id,
        inviteeName: reviewer.name,
        inviteeRole: reviewer.role,
        inviteeUnit: reviewer.unit,
        // Hash of a token that is never minted: this reviewer is seeded, not
        // invited, so no link exists and none should.
        tokenHash: crypto.randomBytes(32).toString('hex'),
        expiresAt: closesAt,
        sentAt: new Date(),
        openedAt: new Date(),
        submittedAt: new Date(),
      },
    });
    invitationIds.push(row.id);
  }

  const now = new Date();
  for (const r of RESPONSES) {
    const sectionId = sectionIds.get(r.section);
    if (!sectionId) throw new Error(`Unknown section key ${r.section}`);
    await prisma.policySectionResponse.create({
      data: {
        roundId: round.id,
        invitationId: invitationIds[r.reviewer],
        sectionId,
        stance: r.stance,
        comment: r.comment ?? null,
        proposedWording: r.proposedWording ?? null,
        concernType: r.concernType ?? null,
        priority: r.priority ?? null,
        submittedAt: now,
      },
    });
  }

  const items = await prisma.policyDecisionItem.findMany({
    where: { section: { documentId: document.id } },
    select: { id: true, placeholder: true },
  });
  const itemByPlaceholder = new Map(items.map((i) => [i.placeholder, i.id]));

  for (const r of ITEM_RESPONSES) {
    const decisionItemId = itemByPlaceholder.get(r.placeholder);
    if (!decisionItemId) {
      console.warn(`No open value ${r.placeholder} in the demo document; skipped.`);
      continue;
    }
    await prisma.policyDecisionItemResponse.create({
      data: {
        roundId: round.id,
        invitationId: invitationIds[r.reviewer],
        decisionItemId,
        acceptsCurrent: r.accepts,
        proposedValue: r.accepts ? null : r.value ?? null,
        reason: r.reason ?? null,
        submittedAt: now,
      },
    });
  }

  // A couple of general responses, so the synthesis has unit barriers to use.
  await prisma.policyGeneralResponse.create({
    data: {
      roundId: round.id,
      invitationId: invitationIds[5],
      overallSupport: 3,
      concern1: 'The 11:00 upload deadline',
      concern2: 'No second analyser run funded',
      barriers:
        'We cannot meet an 11:00 deadline with one morning analyser run. Either the '
        + 'deadline moves or a second run is funded.',
      resourcesNeeded: 'Reagents for a second daily chemistry run, and one extra scientist on early shift.',
      submittedAt: now,
    },
  });
  await prisma.policyGeneralResponse.create({
    data: {
      roundId: round.id,
      invitationId: invitationIds[2],
      overallSupport: 4,
      concern1: 'The cut-off has no clinical override',
      barriers: 'Urgent cases missing the cut-off end up on a standby list that often does not run.',
      resourcesNeeded: 'Nothing material — a named consultant able to add an urgent case.',
      submittedAt: now,
    },
  });

  const counts = {
    sections: SECTIONS.length,
    openValues: items.length,
    reviewers: REVIEWERS.length,
    sectionResponses: RESPONSES.length,
    valueResponses: ITEM_RESPONSES.length,
  };

  console.log([
    '',
    'Seeded the demo review.',
    '',
    `  round id         ${round.id}`,
    `  sections         ${counts.sections}`,
    `  open values      ${counts.openValues}`,
    `  reviewers        ${counts.reviewers} (all invented)`,
    `  responses        ${counts.sectionResponses} section, ${counts.valueResponses} open-value`,
    '',
    `  Open it at  /dashboard/policy-review/${round.id}`,
    `  Analysis at /dashboard/policy-review/${round.id}/analysis`,
    '',
    'What a correct analysis must say:',
    '  - section 4  : a patient-safety concern from ONE consultant anaesthetist,',
    '                 reported on its own and not as an overruled minority.',
    '  - section 5  : a conflict between Anaesthesia and the Laboratory on the',
    '                 upload time, stated neutrally.',
    '  - [11:00]    : 14:00 with 3 supporters, 12:00 with 2, and 2 accepting 11:00.',
    '  - section 10 : a proposal that would weaken the right to decline an unsafe',
    '                 case, flagged clinical_review_required.',
    '  - section 15 : insufficient_input, from one response.',
    '',
  ].join('\n'));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
