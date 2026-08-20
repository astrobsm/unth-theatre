/**
 * Turning a pre-op safety finding into the screen that fixes it.
 *
 * Two properties matter here and neither is about medicine:
 *
 *   Every actionable code the analyser can emit must have a destination. A
 *   finding that says "consent is missing" and offers nowhere to record one is
 *   how the check became something staff learned to scroll past.
 *
 *   `returnTo` must never leave the application. It is attached to a link the
 *   user clicks, so an unvalidated value would make every finding an open
 *   redirect — a phishing link that genuinely originates from the hospital's
 *   own theatre system.
 */
import { describe, expect, it } from 'vitest';

import { analyzePreopSafety } from '../../src/lib/medicalScribe';
import { CODE_TO_FIELD, PREOP_FIELDS } from '../../src/lib/preopData';
import {
  RESOLUTIONS,
  isBlocking,
  resolutionFor,
  resolutionHref,
  safeReturnTo,
} from '../../src/lib/scribeResolutions';

const SCRIBE = '/dashboard/surgeries/abc/scribe';

describe('every actionable finding has somewhere to go', () => {
  it('routes every code the analyser emits on an empty booking', () => {
    // An empty booking is the worst case: it triggers every "missing" rule at
    // once, which is exactly the set that must be resolvable.
    const result = analyzePreopSafety({ patient: { age: 60, ageUnit: 'YEARS' } });
    const codes = result.findings.map((f) => f.code).filter(Boolean) as string[];

    expect(codes.length).toBeGreaterThan(5);
    const unroutable = [...new Set(codes)].filter((c) => !resolutionFor(c));
    expect(unroutable).toEqual([]);
  });

  it('flags a missing consent as critical, and routes it to the consent page', () => {
    const result = analyzePreopSafety({});
    const consent = result.findings.find((f) => f.code === 'CONSENT_MISSING');
    expect(consent?.severity).toBe('CRITICAL');
    expect(resolutionHref('CONSENT_MISSING', 'abc')).toBe('/dashboard/surgeries/abc/consent?code=CONSENT_MISSING');
  });

  it('emits no code once consent is on record', () => {
    // Either route to documenting it counts: a signature captured on the
    // device, or a photograph of the signed paper.
    for (const s of [{ consentSignedElectronically: true }, { consentFileData: 'data:...' }]) {
      const r = analyzePreopSafety(s);
      expect(r.findings.find((f) => f.code === 'CONSENT_MISSING')).toBeUndefined();
    }
  });

  it('gives every resolution a label, a hint and a responsible role', () => {
    for (const [code, r] of Object.entries(RESOLUTIONS)) {
      expect(r.label.length, code).toBeGreaterThan(0);
      expect(r.hint.length, code).toBeGreaterThan(10);
      expect(r.who.length, code).toBeGreaterThan(0);
      // Paths are relative to the surgery, so they must start with a slash and
      // must not smuggle in a query of their own.
      expect(r.path.startsWith('/'), code).toBe(true);
      expect(r.path.includes('?'), code).toBe(false);
    }
  });
});

describe('building the link', () => {
  it('appends returnTo so the user lands back on the check', () => {
    expect(resolutionHref('CONSENT_MISSING', 'abc', SCRIBE))
      .toBe(`/dashboard/surgeries/abc/consent?code=CONSENT_MISSING&returnTo=${encodeURIComponent(SCRIBE)}`);
  });

  it('encodes a surgery id rather than trusting it', () => {
    expect(resolutionHref('CONSENT_MISSING', 'a/b')).toBe('/dashboard/surgeries/a%2Fb/consent?code=CONSENT_MISSING');
  });

  it('returns null for an unknown code or a missing id', () => {
    expect(resolutionHref('NO_SUCH_CODE', 'abc')).toBeNull();
    expect(resolutionHref(undefined, 'abc')).toBeNull();
    expect(resolutionHref('CONSENT_MISSING', '')).toBeNull();
  });
});

describe('returnTo can never leave the application', () => {
  it('drops anything that is not a plain in-app path', () => {
    for (const hostile of [
      'https://evil.example/steal',
      '//evil.example/steal',
      'http://unth-theatre.orm.evil.example',
      'javascript:alert(1)',
    ]) {
      // Neither attached to a link...
      expect(resolutionHref('CONSENT_MISSING', 'abc', hostile))
        .toBe('/dashboard/surgeries/abc/consent?code=CONSENT_MISSING');
      // ...nor honoured when read back by the destination page.
      expect(safeReturnTo(hostile, '/fallback')).toBe('/fallback');
    }
  });

  it('keeps a legitimate in-app path', () => {
    expect(safeReturnTo(SCRIBE, '/fallback')).toBe(SCRIBE);
  });

  it('falls back when absent', () => {
    expect(safeReturnTo(null, '/fallback')).toBe('/fallback');
    expect(safeReturnTo('', '/fallback')).toBe('/fallback');
  });
});

describe('what stops a case', () => {
  it('treats only critical findings as blocking', () => {
    expect(isBlocking('CRITICAL')).toBe(true);
    expect(isBlocking('WARNING')).toBe(false);
    expect(isBlocking('INFO')).toBe(false);
    expect(isBlocking('OK')).toBe(false);
  });
});

describe('the lab findings lead somewhere the value can be entered', () => {
  it('does NOT send them to the booking edit page', () => {
    // The original mistake: /edit covers ward, schedule and theatre and has no
    // clinical fields, so every lab finding led to a dead end.
    for (const code of Object.keys(RESOLUTIONS)) {
      expect(RESOLUTIONS[code].path, code).not.toBe('/edit');
    }
  });

  it('routes every lab and assessment code to the pre-op data form', () => {
    for (const code of Object.keys(CODE_TO_FIELD)) {
      expect(resolutionFor(code)?.path, code).toBe('/preop-data');
    }
  });

  it('names a field the form actually renders, for each of them', () => {
    // Without this a deep link focuses nothing and the user is dropped into a
    // long form with no indication of which box to fill.
    const rendered = new Set(PREOP_FIELDS.map((f) => f.name));
    for (const [code, field] of Object.entries(CODE_TO_FIELD)) {
      expect(rendered.has(field), `${code} -> ${field}`).toBe(true);
    }
  });

  it('carries the code so the destination can focus that field', () => {
    expect(resolutionHref('HB_MISSING', 'abc'))
      .toBe('/dashboard/surgeries/abc/preop-data?code=HB_MISSING');
  });
});
