// ============================================================
// The counselling library, assembled
// ------------------------------------------------------------
// One entry for every category in the procedure catalogue — 97 of them,
// covering all 2,337 distinct procedures the hospital can book.
//
// THE COVERAGE GUARANTEE. scripts/lib-tests/counselling.test.ts reads
// src/lib/procedures/catalogue.ts, extracts every `category`, and fails if any
// of them is missing here — and fails equally if this file holds a key that no
// longer exists in the catalogue. That test is what makes "every procedure in
// the database" a fact rather than a claim: a procedure added to a new
// category cannot ship without its counselling.
//
// WHY NOT ONE ENTRY PER PROCEDURE. Because 2,337 leaflets would be 2,337
// pieces of clinical text nobody had read, and the difference between
// "Inguinal hernia repair" and "Recurrent inguinal hernia repair" is a
// sentence the surgeon says, not a document. Where a specific procedure does
// need its own words, PROCEDURE_OVERRIDES below takes precedence — matched on
// the same slug the catalogue uses, so spelling cannot drift.
// ============================================================

import type { CounsellingEntry, CounsellingLibrary } from '../types';
import { GENERAL_SURGERY } from './generalSurgery';
import { UROLOGY_OBGYN } from './urologyObgyn';
import { ENT_MAXFAX_PLASTICS } from './entMaxfaxPlastics';
import { ORTHO_NEURO_CARDIO_PAEDS } from './orthoNeuroCardioPaeds';
import { OPHTHALMOLOGY } from './ophthalmology';

/** Every category entry, merged. */
export const BY_CATEGORY: CounsellingLibrary = {
  ...GENERAL_SURGERY,
  ...UROLOGY_OBGYN,
  ...ENT_MAXFAX_PLASTICS,
  ...ORTHO_NEURO_CARDIO_PAEDS,
  ...OPHTHALMOLOGY,
};

/**
 * Counselling for one named operation, overriding its category.
 *
 * Keyed by the procedure SLUG, as produced by procedureSlug() in
 * lib/procedures/normalise — so that a name typed with different punctuation
 * or capitalisation still matches.
 *
 * Deliberately empty at the outset. Entries are added when a unit asks for
 * one, reviewed in the same way as everything else in this directory. An
 * empty override map is not an omission: the category entry is complete
 * counselling on its own, and inventing procedure-specific detail nobody has
 * reviewed would be worse than the general truth.
 */
export const PROCEDURE_OVERRIDES: Record<string, CounsellingEntry> = {};

export const CATEGORY_COUNT = Object.keys(BY_CATEGORY).length;
