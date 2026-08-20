/**
 * Does the database actually capture what the policy says it replicates?
 *
 * TABLE_POLICIES is a statement of intent. The capture triggers are the
 * reality, and they are installed by migrations. Nothing connected the two, so
 * the two could disagree indefinitely without anything failing: the policy
 * named 50 tables while the triggers covered 14, and the only symptom was rows
 * quietly not arriving on the other node.
 *
 * That gap is not a bug in itself — capture is switched on in deliberate
 * phases, because a quarantine class needs a clinician to confirm its
 * classification first, and identity replication can lock people out of a
 * system they are operating. The bug is that the gap was INVISIBLE. A table
 * added to the policy and forgotten looked exactly like a table deferred on
 * purpose.
 *
 * So the deferred set is written down here. Adding a table to TABLE_POLICIES
 * now forces a choice: enable capture for it, or name it below as deliberately
 * pending. Either is fine. Silently doing neither is not.
 *
 * It cost six days of a stuck queue to learn this. A surgeon, a consultant
 * anaesthetist and seven house officers registered on the cloud and never
 * reached the theatre server, because `users` sits in the pending set and
 * every notification addressed to them failed its foreign key.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { TABLE_POLICIES } from '../../src/lib/sync/syncPolicy';

const MIGRATIONS = path.join(__dirname, '../../prisma/migrations');

/**
 * Capture is switched on for these, and deliberately not yet for the rest.
 *
 * The reasons are recorded in 20260810090000_hybrid_sync_journal: the clinical
 * tables quarantine rather than overwrite, but every conflict in them needs a
 * person, so a clinician confirms the classifications before capture starts.
 *
 * Removing a name from this list means "capture is now enabled for it", and
 * the test below will hold you to that.
 *
 * One thing this suite cannot see: a migration may enable a table on ONE node
 * only, as the identity migration does. "Captured" here means "some migration
 * switches it on somewhere", which is the right question for catching a table
 * that was classified and then forgotten, and the wrong one for asking which
 * direction a given table flows. Read the migration for that.
 */
const PENDING_CAPTURE = [
  // Clinical content. Quarantines rather than overwrites; needs clinical
  // sign-off on the classifications before capture begins.
  'anesthetic_prescriptions',
  'blood_requests',
  'emergency_prescriptions',
  'holding_area_assessments',
  'pacu_assessments',
  'pacu_medications',
  'pacu_vital_signs',
  'postop_prescriptions',
  'pre_operative_visits',
  'preoperative_investigations',
  'prescription_medication_items',

  // Identity — users, user_module_grants, onboarding_submissions — is no
  // longer here. Capture was enabled for it on 17 August 2026, on the CLOUD
  // NODE ONLY, so identity flows downward and cannot flow up. See
  // 20260817170000_sync_enable_identity_cloud_only for why that asymmetry is
  // the safe form: decide() enforces CLOUD_AUTHORITATIVE for concurrent
  // changes but applies an in-sequence one before consulting the class, so a
  // local edit could otherwise have reached the cloud.

  // Communications. The local node queues and the cloud transmits.
  'communication_events',
  'communication_messages',
  'communication_templates',
  'escalation_policies',
  'feedback_requests',
  'workflow_rules',

  // Conflict adjudication.
  'conflict_analyses',
  'conflict_answers',
  'conflict_approvals',
  'conflict_decisions',
  'conflict_questions',
  'conflict_responses',
  'conflict_reviews',
  'conflict_stakeholders',

  // Clinical OCR.
  'ocr_documents',
  'ocr_pages',
  'ocr_provider_runs',
  'ocr_quality_assessments',
  'ocr_signature_regions',
  'ocr_tokens',
  'ocr_verifications',
  'ocr_versions',
];

/**
 * A `--` comment must not count as an enabled table.
 *
 * The phase-1 migration lists the deferred tables by name inside its comments,
 * which is exactly the text a naive reader would mistake for the real list.
 */
function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/**
 * Tables a migration switches capture on for, in either form it is written:
 * a direct `sync_enable_table('x')`, or a name in the ARRAY the phase-1
 * migration loops over.
 */
function tablesEnabledBy(sql: string): string[] {
  const clean = withoutComments(sql);
  if (!clean.includes('sync_enable_table')) return [];

  const found = new Set<string>();
  for (const m of clean.matchAll(/sync_enable_table\(\s*'([a-z_]+)'\s*\)/g)) {
    found.add(m[1]);
  }
  for (const block of clean.matchAll(/ARRAY\s*\[([^\]]*)\]/gi)) {
    for (const lit of block[1].matchAll(/'([a-z_]+)'/g)) found.add(lit[1]);
  }
  return [...found];
}

function capturedTables(): Set<string> {
  const captured = new Set<string>();
  for (const dir of fs.readdirSync(MIGRATIONS)) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    for (const t of tablesEnabledBy(fs.readFileSync(file, 'utf8'))) captured.add(t);
  }
  return captured;
}

describe('capture triggers against the sync policy', () => {
  const captured = capturedTables();
  const classified = TABLE_POLICIES.map((p) => p.table);

  it('reads the migrations at all', () => {
    // Guards the parser rather than the schema. Every assertion below is
    // vacuous if this returns nothing, and a silently empty result is exactly
    // the failure this suite exists to prevent.
    expect(captured.size).toBeGreaterThan(0);
    expect(captured.has('surgeries')).toBe(true);
    expect(captured.has('patients')).toBe(true);
  });

  it('never captures a table the policy does not classify', () => {
    // This is the dangerous direction. An entry arriving for an unclassified
    // table has no rule saying whether to overwrite, union or quarantine it,
    // and the default of "do not sync" cannot protect a row that is already
    // in the journal.
    const unclassified = [...captured].filter((t) => !classified.includes(t)).sort();
    expect(unclassified).toEqual([]);
  });

  it('accounts for every classified table: captured, or deliberately pending', () => {
    // The point of the suite. A table added to TABLE_POLICIES and forgotten
    // now fails here by name, instead of replicating nothing until somebody
    // notices two dashboards disagreeing.
    //
    // Asserted as "what is unaccounted for", not as a comparison of the two
    // full lists: the equality form reports both 36-item arrays and leaves the
    // reader to spot the one that differs, which is no help at all to whoever
    // meets this failure in the middle of a theatre list.
    const unaccounted = classified
      .filter((t) => !captured.has(t) && !PENDING_CAPTURE.includes(t))
      .sort();
    expect(unaccounted).toEqual([]);
  });

  it('does not list a captured table as still pending', () => {
    // The other half: enabling capture without removing the name here would
    // leave the manifest lying about the state of the system.
    const both = PENDING_CAPTURE.filter((t) => captured.has(t)).sort();
    expect(both).toEqual([]);
  });

  it('names every pending table in the policy', () => {
    // A name here that no longer exists in TABLE_POLICIES is stale, and a
    // stale manifest is how this drifted in the first place.
    const unknown = PENDING_CAPTURE.filter((t) => !classified.includes(t)).sort();
    expect(unknown).toEqual([]);
  });
});
