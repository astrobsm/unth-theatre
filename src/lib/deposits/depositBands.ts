/**
 * What a patient pays up front, and who is allowed to carry it away.
 *
 * TWO DEPOSITS, NOT FOUR. The hospital charges one consumable deposit (it
 * covers the surgical pack AND the anaesthetic consumables together) and one
 * pharmacy deposit (surgical drugs AND anaesthetic drugs together). Both are
 * set by the operative magnitude of the case. That is why `DepositKind` has
 * two members and not four: inventing a separate price for the anaesthetic
 * half would be a number nobody at the shop or the pharmacy counter is
 * actually asking for.
 *
 * FOUR HANDOVERS, THOUGH. One payment is collected in two parts, by two
 * different people: the scrub nurse takes the surgical half, the anaesthetist
 * on the case takes the anaesthetic half. A pack signed out wholesale to "the
 * theatre" is a pack nobody is answerable for, and the anaesthetic drugs are
 * the half that includes the controlled ones. So collection is recorded per
 * `CollectionStream`, with the collector named.
 *
 * THE FIGURES LIVE IN THE DATABASE, NOT HERE. The amounts below are the
 * starting values the hospital set in November 2026; an administrator changes
 * them in Settings and this file must not be the thing that has to be
 * redeployed when tariffs move. They exist in code only so a fresh install is
 * not silently charging nothing, and so a test can state what the bands were
 * when they were last agreed.
 *
 * EMPTY AND ZERO STAY DIFFERENT all the way through, as they already do in
 * TheatreSetting: null means nobody has set this band, and the screen must say
 * so rather than ask a patient for ₦0. A cashier who collects nothing because
 * an administrator had not got to the number yet is the failure this guards.
 *
 * Pure: no database, no network, no React. The arithmetic and the wording are
 * arguable in a test rather than discovered at the consumable shop.
 */

import type { ProcedureCategory } from '@/lib/packs/patientPayNotice';
import { procedureCategoryLabel } from '@/lib/packs/patientPayNotice';

export type { ProcedureCategory };

/** Every operative magnitude that carries a deposit, smallest first. */
export const DEPOSIT_CATEGORIES: ProcedureCategory[] = [
  'MINOR',
  'INTERMEDIATE',
  'MAJOR',
  'SUPER_MAJOR',
];

/** The two deposits a patient is asked for. */
export type DepositKind = 'CONSUMABLE' | 'PHARMACY';

export const DEPOSIT_KINDS: DepositKind[] = ['CONSUMABLE', 'PHARMACY'];

export const DEPOSIT_KIND_LABEL: Record<DepositKind, string> = {
  CONSUMABLE: 'Consumable deposit',
  PHARMACY: 'Pharmacy deposit',
};

/** Said in full where a patient or a ward nurse has to understand it. */
export const DEPOSIT_KIND_COVERS: Record<DepositKind, string> = {
  CONSUMABLE: 'surgical consumables and anaesthetic consumables',
  PHARMACY: 'surgical drugs and anaesthetic drugs',
};

/** Where each deposit is actually paid. Named once; see CONSUMABLE_SHOP. */
export const DEPOSIT_KIND_PAY_POINT: Record<DepositKind, string> = {
  CONSUMABLE: 'the CONSUMABLE SHOP at the EMERGENCY',
  PHARMACY: 'the THEATRE PHARMACY',
};

/** The four handovers. Two per deposit: the surgical half and the anaesthetic half. */
export type CollectionStream =
  | 'SURGICAL_CONSUMABLES'
  | 'ANAESTHETIC_CONSUMABLES'
  | 'SURGICAL_DRUGS'
  | 'ANAESTHETIC_DRUGS';

export const COLLECTION_STREAMS: CollectionStream[] = [
  'SURGICAL_CONSUMABLES',
  'ANAESTHETIC_CONSUMABLES',
  'SURGICAL_DRUGS',
  'ANAESTHETIC_DRUGS',
];

/**
 * Who is entitled to collect each half.
 *
 * SCRUB_NURSE for the surgical halves, ANAESTHETIST for the anaesthetic ones.
 * This is not a formality: the anaesthetic drugs are where the controlled
 * substances are, and "the theatre collected it" is not a name that can be
 * asked about afterwards.
 */
export type CollectorKind = 'SCRUB_NURSE' | 'ANAESTHETIST';

export interface StreamSpec {
  stream: CollectionStream;
  kind: DepositKind;
  /** What the person signing for it is actually taking. */
  label: string;
  collector: CollectorKind;
  /** Said on the button, so the dropdown's purpose is unambiguous. */
  collectorLabel: string;
}

export const STREAMS: StreamSpec[] = [
  {
    stream: 'SURGICAL_CONSUMABLES',
    kind: 'CONSUMABLE',
    label: 'Surgical consumable pack',
    collector: 'SCRUB_NURSE',
    collectorLabel: 'scrub nurse',
  },
  {
    stream: 'ANAESTHETIC_CONSUMABLES',
    kind: 'CONSUMABLE',
    label: 'Anaesthetic consumables',
    collector: 'ANAESTHETIST',
    collectorLabel: 'anaesthetist',
  },
  {
    stream: 'SURGICAL_DRUGS',
    kind: 'PHARMACY',
    label: 'Surgical drugs and dressings',
    collector: 'SCRUB_NURSE',
    collectorLabel: 'scrub nurse',
  },
  {
    stream: 'ANAESTHETIC_DRUGS',
    kind: 'PHARMACY',
    label: 'Anaesthetic drugs',
    collector: 'ANAESTHETIST',
    collectorLabel: 'anaesthetist',
  },
];

export function streamsFor(kind: DepositKind): StreamSpec[] {
  return STREAMS.filter((s) => s.kind === kind);
}

export function streamSpec(stream: string): StreamSpec | null {
  return STREAMS.find((s) => s.stream === stream) ?? null;
}

/** REQUESTED → PAID → COLLECTED. Nothing skips a step forwards. */
export type DepositStatus = 'REQUESTED' | 'PAID' | 'COLLECTED' | 'WAIVED';

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  REQUESTED: 'Requested',
  PAID: 'Paid',
  COLLECTED: 'Collected',
  WAIVED: 'Waived',
};

/**
 * The bands as the hospital set them, November 2026.
 *
 * Seeded into TheatreSetting by the migration that introduced SUPER_MAJOR, and
 * editable from Settings from that moment on. Code reads the database, never
 * this table, except when asked for a default to offer.
 */
export const DEFAULT_BANDS: Record<DepositKind, Record<ProcedureCategory, number>> = {
  CONSUMABLE: {
    MINOR: 52323,
    INTERMEDIATE: 65570,
    MAJOR: 110360,
    SUPER_MAJOR: 146090,
  },
  PHARMACY: {
    MINOR: 20000,
    INTERMEDIATE: 30000,
    MAJOR: 40000,
    SUPER_MAJOR: 50000,
  },
};

/**
 * The TheatreSetting column that holds one band.
 *
 * ONE function owns the spelling. The column names are camelCase compounds
 * (`intermediateConsumableFee`) and there are eight of them; a second place
 * that builds the same string by hand is a place that can disagree, and the
 * disagreement would show up as a band that silently reads null — which the
 * screen then reports, correctly and uselessly, as "not set".
 */
export function feeField(kind: DepositKind, category: ProcedureCategory): string {
  const prefix = {
    MINOR: 'minor',
    INTERMEDIATE: 'intermediate',
    MAJOR: 'major',
    SUPER_MAJOR: 'superMajor',
  }[category];
  const middle = kind === 'CONSUMABLE' ? 'Consumable' : 'Pharmacy';
  return `${prefix}${middle}Fee`;
}

/** Every fee column, in the order the settings form shows them. */
export function allFeeFields(): string[] {
  const out: string[] = [];
  for (const kind of DEPOSIT_KINDS) {
    for (const c of DEPOSIT_CATEGORIES) out.push(feeField(kind, c));
  }
  return out;
}

/**
 * The magnitude a surgery carries, in the four words this module uses.
 *
 * Surgery.magnitude is a free-ish string column (it predates the enum), so
 * "super major", "Super-Major" and "SUPER_MAJOR" all occur. Anything that is
 * not one of the four is null — NOT a guess at MINOR, because pricing a super
 * major case as a minor one would under-collect by ninety-four thousand naira.
 */
export function normaliseCategory(value: string | null | undefined): ProcedureCategory | null {
  const key = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (DEPOSIT_CATEGORIES as string[]).includes(key) ? (key as ProcedureCategory) : null;
}

/** "SUPER MAJOR" etc., or null. Reuses the wording the patient message uses. */
export function categoryLabel(value: string | null | undefined): string | null {
  return procedureCategoryLabel(value);
}

/**
 * What this case's deposit is, given the settings row.
 *
 * Returns null for "no band set" AND for "no magnitude on the case", because
 * both mean the same thing to the person at the counter: do not ask this
 * patient for a figure yet. The caller says which it was.
 */
export function bandAmount(
  settings: Record<string, unknown> | null | undefined,
  kind: DepositKind,
  category: string | null | undefined,
): number | null {
  const c = normaliseCategory(category);
  if (!c || !settings) return null;
  const raw = settings[feeField(kind, c)];
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw));
  return Number.isFinite(n) ? n : null;
}

/** ₦146,090.00 — the way it is written on a receipt. */
export function naira(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface DepositView {
  kind: DepositKind;
  status: DepositStatus;
  expected: number | null;
  /** Why there is no figure, when there is none. The screen prints this. */
  noAmountReason: string | null;
}

/**
 * What to show for one deposit on one case.
 *
 * The reason strings are the whole point. "—" in an amount column sends a
 * cashier to ask a colleague; "This case has no operative magnitude" sends
 * them to the booking, which is where the fault actually is.
 */
export function depositView(
  settings: Record<string, unknown> | null | undefined,
  kind: DepositKind,
  magnitude: string | null | undefined,
  status: DepositStatus = 'REQUESTED',
): DepositView {
  const category = normaliseCategory(magnitude);
  if (!category) {
    return {
      kind,
      status,
      expected: null,
      noAmountReason:
        'This case has no operative magnitude, so no deposit band applies. Set it on the booking.',
    };
  }
  const expected = bandAmount(settings, kind, category);
  return {
    kind,
    status,
    expected,
    noAmountReason:
      expected == null
        ? `No ${categoryLabel(category)} ${kind === 'CONSUMABLE' ? 'consumable' : 'pharmacy'} band has been set. An administrator sets it in Settings.`
        : null,
  };
}

/**
 * May this status move to that one?
 *
 * Forwards only, and never past a step. A pack marked collected before anybody
 * recorded the payment is a pack that left without being paid for, and the row
 * would then read as though it had been. WAIVED is reachable from REQUESTED
 * alone: waiving a deposit already paid is a refund, which is not this module.
 */
export function canAdvance(from: DepositStatus, to: DepositStatus): boolean {
  if (from === to) return false;
  if (to === 'PAID') return from === 'REQUESTED';
  if (to === 'COLLECTED') return from === 'PAID';
  if (to === 'WAIVED') return from === 'REQUESTED';
  if (to === 'REQUESTED') return from === 'PAID' || from === 'WAIVED';
  return false;
}

/** Said to whoever is refused, in words that name the missing step. */
export function advanceRefusal(from: DepositStatus, to: DepositStatus): string {
  if (from === to) return `This is already marked ${DEPOSIT_STATUS_LABEL[to].toLowerCase()}.`;
  if (to === 'COLLECTED' && from === 'REQUESTED') {
    return 'Record the payment first. A pack cannot be collected before it has been paid for.';
  }
  if (to === 'PAID' && from === 'COLLECTED') {
    return 'This has already been collected, so the payment cannot be undone from here.';
  }
  if (to === 'WAIVED' && from !== 'REQUESTED') {
    return 'A deposit that has already been paid cannot be waived here — that is a refund.';
  }
  return `A deposit cannot move from ${DEPOSIT_STATUS_LABEL[from].toLowerCase()} to ${DEPOSIT_STATUS_LABEL[to].toLowerCase()}.`;
}
