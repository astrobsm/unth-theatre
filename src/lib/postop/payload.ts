// ============================================================
// Turning what the browser sent into what the database will take
// ------------------------------------------------------------
// The whitelist of what may be written is DERIVED FROM THE TEMPLATE, not
// written out again here. A field the form can show is a field that can be
// saved, and there is no second list to forget to update — which is the usual
// way a new field silently fails to persist and nobody notices until somebody
// asks where their data went.
//
// It is also the security boundary. Nothing reaches Prisma except keys the
// template declares, so a caller cannot set `status`, `signedById`,
// `createdById` or `syncVersion` by putting them in the request body. Those are
// decided by the route from the session, never by the payload.
//
// COERCION IS DELIBERATELY STRICT ABOUT TYPE AND FORGIVING ABOUT SHAPE. An
// empty string becomes null, because a form sends "" for a field the user
// cleared and storing that is how a column ends up with two kinds of empty. A
// number that is not a number is an error rather than a zero: silently writing
// 0 mL of blood loss would corrupt every average computed afterwards.
// ============================================================

import {
  type FieldDef,
  type ResolvedTemplate,
  type RepeatKind,
  allFields,
} from './templates';
import { isKnown } from './vocabulary';

export interface ParseResult {
  /** Column values for post_op_notes. */
  values: Record<string, unknown>;
  /** Template-contributed fields, for the extras JSONB. */
  extras: Record<string, unknown>;
  /** Rows for the child tables, already ordered. */
  children: Record<RepeatKind, Record<string, unknown>[]>;
  /** Anything the payload got wrong. A non-empty list means reject the request. */
  errors: string[];
}

const EMPTY_CHILDREN = (): Record<RepeatKind, Record<string, unknown>[]> => ({
  prepSteps: [],
  drains: [],
  specimens: [],
  heldMedications: [],
});

/**
 * One value, coerced to what its field says it is.
 *
 * Returns `undefined` for "leave this column alone" and `null` for "the user
 * cleared it". The two are different: a PATCH that omits a field must not blank
 * it, which is the same rule the sync layer follows when applying a partial
 * payload.
 */
function coerce(field: FieldDef, raw: unknown, errors: string[]): unknown {
  if (raw === undefined) return undefined;
  if (raw === null) return null;

  switch (field.kind) {
    case 'multi': {
      if (!Array.isArray(raw)) {
        errors.push(`${field.label} must be a list.`);
        return undefined;
      }
      const values = raw.filter((v): v is string => typeof v === 'string');
      if (field.catalogue) {
        for (const v of values) {
          if (!isKnown(field.catalogue, v)) {
            errors.push(`${field.label}: "${v}" is not one of the available options.`);
            return undefined;
          }
        }
      }
      // Duplicates are meaningless in a multi-select and make every later
      // count wrong, so they are removed rather than rejected.
      return Array.from(new Set(values));
    }

    case 'single': {
      if (typeof raw !== 'string') {
        errors.push(`${field.label} must be a single choice.`);
        return undefined;
      }
      if (raw.trim() === '') return null;
      if (field.catalogue && !isKnown(field.catalogue, raw)) {
        errors.push(`${field.label}: "${raw}" is not one of the available options.`);
        return undefined;
      }
      return raw;
    }

    case 'text':
    case 'longtext': {
      if (typeof raw !== 'string') {
        errors.push(`${field.label} must be text.`);
        return undefined;
      }
      const trimmed = raw.trim();
      return trimmed === '' ? null : trimmed;
    }

    case 'number': {
      if (raw === '') return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors.push(`${field.label} must be a number.`);
        return undefined;
      }
      if (field.min !== undefined && n < field.min) {
        errors.push(`${field.label} cannot be less than ${field.min}.`);
        return undefined;
      }
      if (field.max !== undefined && n > field.max) {
        errors.push(`${field.label} cannot be more than ${field.max}.`);
        return undefined;
      }
      return n;
    }

    case 'datetime': {
      if (raw === '') return null;
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) {
        errors.push(`${field.label} is not a valid date and time.`);
        return undefined;
      }
      return d;
    }

    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      if (raw === '') return null;
      errors.push(`${field.label} must be yes or no.`);
      return undefined;
    }

    default:
      return undefined;
  }
}

/** Fields a repeating section's rows are made of, by section. */
function repeatFields(template: ResolvedTemplate): Partial<Record<RepeatKind, FieldDef[]>> {
  const out: Partial<Record<RepeatKind, FieldDef[]>> = {};
  for (const s of template.sections) {
    if (s.repeat) out[s.repeat] = s.fields;
  }
  return out;
}

/** How many rows a repeating section may have. Guards against a runaway client. */
const MAX_ROWS = 40;

/**
 * A request body, checked and split into the shapes the tables want.
 *
 * `body.values` carries the flat field map and `body.children` the repeating
 * rows — the same shape the form holds, so there is no translation layer in the
 * browser either.
 */
export function parseNotePayload(body: unknown, template: ResolvedTemplate): ParseResult {
  const errors: string[] = [];
  const values: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  const children = EMPTY_CHILDREN();

  const b = (body ?? {}) as { values?: unknown; children?: unknown };
  const incoming = (b.values ?? {}) as Record<string, unknown>;

  // ---- Flat fields --------------------------------------------------------
  // Only fields the template declares, and each into the right destination:
  // a column for a core field, the extras document for a template field.
  const repeats = new Set(
    template.sections.filter((s) => s.repeat).flatMap((s) => s.fields.map((f) => f.key)),
  );
  for (const field of allFields(template)) {
    if (repeats.has(field.key) && !(field.key in incoming)) continue;
    if (!(field.key in incoming)) continue;
    const value = coerce(field, incoming[field.key], errors);
    if (value === undefined) continue;
    if (field.extra) extras[field.key] = value;
    else values[field.key] = value;
  }

  // ---- Repeating sections -------------------------------------------------
  const rf = repeatFields(template);
  const incomingChildren = (b.children ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(rf) as RepeatKind[]) {
    const rows = incomingChildren[key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      errors.push(`${key} must be a list of entries.`);
      continue;
    }
    if (rows.length > MAX_ROWS) {
      errors.push(`No more than ${MAX_ROWS} entries are accepted in one section.`);
      continue;
    }
    rows.forEach((row, i) => {
      const parsed: Record<string, unknown> = {};
      const source = (row ?? {}) as Record<string, unknown>;
      for (const field of rf[key] ?? []) {
        const value = coerce(field, source[field.key], errors);
        if (value !== undefined) parsed[field.key] = value;
      }
      // The sequence is the data for preparation steps, so it comes from the
      // order the rows arrived in rather than from anything the client says —
      // a client that reorders rows should not be able to claim a sequence
      // that contradicts the order it sent.
      if (key === 'prepSteps') parsed.sequence = i + 1;
      children[key].push(parsed);
    });
  }

  // ---- Images -------------------------------------------------------------
  // Carried over from the free-text note, which allowed two of up to 10 MB.
  // The same limits, because the reason for them has not changed: these are
  // base64 in a TEXT[] and they cross a domestic uplink to the other node.
  if ('images' in (incoming as object) || Array.isArray((b as { images?: unknown }).images)) {
    const raw = (incoming.images ?? (b as { images?: unknown }).images) as unknown;
    if (Array.isArray(raw)) {
      const images = raw.filter((s): s is string => typeof s === 'string' && s.startsWith('data:image/'));
      if (images.length > MAX_IMAGES) {
        errors.push(`A maximum of ${MAX_IMAGES} images is allowed.`);
      } else if (images.some((s) => s.length > MAX_IMAGE_BASE64)) {
        errors.push('Each image must not exceed 10 MB.');
      } else {
        values.images = images;
      }
    }
  }

  return { values, extras, children, errors };
}

export const MAX_IMAGES = 2;
/** 10 MB of image is about 13.7 MB once base64-encoded. */
export const MAX_IMAGE_BASE64 = Math.ceil((10 * 1024 * 1024 * 4) / 3) + 1024;

/**
 * The flat value map for a note read back out of the database.
 *
 * The inverse of the split above: columns and extras recombined into the one
 * shape the validator, the nursing summary and the form all work in. `extras`
 * is kept under its own key as well, because the nursing summary reads flap and
 * graft fields directly from it rather than through a template that may have
 * changed since.
 */
export function noteToValues(note: Record<string, unknown>): Record<string, unknown> {
  const extras = (note.extras ?? {}) as Record<string, unknown>;
  return { ...note, ...extras, extras };
}
