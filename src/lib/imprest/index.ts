/**
 * @imprest/shared — the domain core.
 *
 * The API, the offline client and the PDF renderer all depend on this package
 * and nothing depends on them, so a rule stated here is a rule everywhere.
 */

export * from './enums';
export * from './errors';
export * from './money';
export * from './types';
export * from './permissions';
export * from './workflow';
export * from './calculations';
export * from './numbering';
export * from './format';
export * from './validation/index';

export const SHARED_CONTRACT_VERSION = '1.0.0';

/**
 * Bumped whenever the offline schema changes shape. The client compares this
 * with the version stored in IndexedDB and runs its upgrade path on a
 * mismatch, so a stale device cannot silently push malformed mutations.
 */
export const OFFLINE_SCHEMA_VERSION = 1;
