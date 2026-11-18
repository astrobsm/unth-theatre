// ============================================================
// The shape of a counselling entry
// ------------------------------------------------------------
// Six questions, asked of every kind of operation this hospital performs.
// They are the six a patient has to be able to answer before a consent form
// means anything:
//
//   what is going to be done to me          -> whatItIs
//   why is it being proposed                -> whyItIsDone
//   what do I get out of it                 -> benefits
//   what could go wrong, specifically       -> risks
//   what else could I do instead            -> alternatives
//   what will the next weeks be like        -> recovery
//
// WHY ALL SIX ARE REQUIRED by the type, with no optional fields. An entry
// missing "alternatives" reads, to a patient, as though there were none --
// and "you could decide not to have the operation" is an alternative in every
// case, which is exactly the one a hurried author leaves out. Making the
// compiler insist is cheaper than noticing it in a leaflet.
//
// THE RISKS HERE ARE THE SPECIFIC ONES. Bleeding, infection, clots and
// anaesthetic risk are in the universal sections and are printed on every
// sheet; repeating them per category would bury the three or four risks that
// actually distinguish this operation from any other. So `risks` below means:
// what does THIS kind of surgery do that others do not.
//
// KEYED BY CATEGORY, NOT BY PROCEDURE. There are 2,337 distinct procedures in
// the catalogue and 97 categories. A hernia repair and an incisional hernia
// repair share their counselling almost entirely; writing 2,337 leaflets
// would mean 2,337 pieces of clinical text nobody had read. The category is
// the level at which the six answers are both true and useful, and a
// procedure that genuinely needs its own words gets an override --
// see PROCEDURE_OVERRIDES in ./library.
// ============================================================

export interface CounsellingEntry {
  /** What the operation involves, in plain words. 1-2 sentences. */
  whatItIs: string;
  /** The usual reasons it is offered. */
  whyItIsDone: string;
  /** What it is expected to achieve. Never a promise. */
  benefits: string[];
  /**
   * Risks particular to this kind of surgery.
   *
   * NOT the general ones — bleeding, infection, clots and anaesthetic risk
   * are printed on every sheet already. These are the ones a patient could
   * not guess from "an operation".
   */
  risks: string[];
  /** What else could reasonably be considered, including doing nothing. */
  alternatives: string[];
  /** What the days and weeks afterwards usually look like. */
  recovery: string;
}

/**
 * A library keyed by the category strings used in the procedure catalogue.
 *
 * The keys must match src/lib/procedures/catalogue.ts exactly. A near miss
 * produces a leaflet with no operation-specific content and no error, which
 * is the failure mode this whole module is meant to avoid — so
 * scripts/lib-tests/counselling.test.ts asserts every category in the
 * catalogue has an entry here, and that every entry here matches a real
 * category.
 */
export type CounsellingLibrary = Record<string, CounsellingEntry>;
