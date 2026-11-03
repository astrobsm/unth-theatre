/**
 * "Back" meaning back to where you were.
 *
 * Reported from theatre on 3 November, with screenshots:
 *
 *   "the back buttons are not behaving well, when i click on the back button
 *   it takes me to another page which is not where i started off ... when i
 *   click on back, it should save what ever i am doing and then return to the
 *   page where i took off from"
 *
 * The flow in the screenshots: Theatre Reception board -> Surgical Count ->
 * "Back to Surgery" -> Surgery Details, a page the nurse had never opened.
 * Every surgery sub-page hard-coded one parent, and those pages are reached
 * from eight different screens.
 *
 * No patient is named in this file. The paths are routes, not records.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  RETURN_PARAM,
  isSafeReturnPath,
  withReturnTo,
  readReturnTo,
  labelForPath,
  currentReturnPath,
} from '../../src/lib/navigation/returnTo';
import { safeReturnTo, resolutionHref } from '../../src/lib/scribeResolutions';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const BACKSLASH = String.fromCharCode(92);
const ARROW = String.fromCharCode(0x2190);

describe('the parameter is not trusted', () => {
  it('accepts a plain in-app path', () => {
    expect(isSafeReturnPath('/dashboard/theatre-reception')).toBe(true);
    expect(isSafeReturnPath('/dashboard/theatre-reception?case=abc&date=2026-11-04')).toBe(true);
  });

  it('refuses to send a signed-in nurse off-site', () => {
    // Taken at face value this parameter is an open redirect on a link that
    // looks like ours.
    expect(isSafeReturnPath('https://evil.example/login')).toBe(false);
    expect(isSafeReturnPath('http://evil.example')).toBe(false);
    expect(isSafeReturnPath('javascript:alert(1)')).toBe(false);
  });

  it('refuses a protocol-relative path, which browsers treat as absolute', () => {
    expect(isSafeReturnPath('//evil.example/dashboard')).toBe(false);
  });

  it('refuses a backslash, which some browsers normalise to a slash', () => {
    // "/\evil.example" is a real bypass of a startsWith('/') check.
    expect(isSafeReturnPath(`/${BACKSLASH}evil.example`)).toBe(false);
    expect(isSafeReturnPath(`/dashboard${BACKSLASH}..${BACKSLASH}x`)).toBe(false);
  });

  it('refuses control characters, a relative path and rubbish', () => {
    expect(isSafeReturnPath('/dashboard\n/x')).toBe(false);
    expect(isSafeReturnPath('dashboard/surgeries')).toBe(false);
    expect(isSafeReturnPath('')).toBe(false);
    expect(isSafeReturnPath('   ')).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
    expect(isSafeReturnPath(undefined)).toBe(false);
    expect(isSafeReturnPath(42)).toBe(false);
    expect(isSafeReturnPath(`/${'a'.repeat(600)}`)).toBe(false);
  });

  it('is the one validator - the safety-check helper defers to it', () => {
    // There were two implementations of this idea; the older one checked
    // neither backslashes nor control characters.
    expect(safeReturnTo(`/${BACKSLASH}evil.example`, '/fallback')).toBe('/fallback');
    expect(safeReturnTo('https://evil.example', '/fallback')).toBe('/fallback');
    expect(safeReturnTo('/dashboard/surgeries', '/fallback')).toBe('/dashboard/surgeries');
  });
});

describe('a link carries where it was pressed', () => {
  const here = '/dashboard/theatre-reception?case=s1&date=2026-11-04';

  it('adds the origin to a plain href', () => {
    expect(withReturnTo('/dashboard/surgeries/s1/count', here))
      .toBe(`/dashboard/surgeries/s1/count?${RETURN_PARAM}=${encodeURIComponent(here)}`);
  });

  it('keeps a query the href already had', () => {
    const out = withReturnTo('/dashboard/preop-reviews/new?surgeryId=s1', here);
    expect(out).toContain('surgeryId=s1');
    expect(out).toContain(`&${RETURN_PARAM}=`);
  });

  it('keeps the fragment at the end where the browser expects it', () => {
    const out = withReturnTo('/dashboard/surgeries/s1#timing', here);
    expect(out.endsWith('#timing')).toBe(true);
    expect(out).toContain(`?${RETURN_PARAM}=`);
  });

  it('lets the first hop win, so a three-page chain still goes home', () => {
    // Board -> count -> surgery -> back should reach the board, not walk back
    // through every screen in between.
    const already = `/dashboard/surgeries/s1?${RETURN_PARAM}=%2Fdashboard%2Ftheatre-reception`;
    expect(withReturnTo(already, '/dashboard/surgeries')).toBe(already);
  });

  it('passes the href through untouched when there is nothing safe to carry', () => {
    // Callers apply this unconditionally; it must never corrupt a link.
    expect(withReturnTo('/dashboard/surgeries/s1/count', null))
      .toBe('/dashboard/surgeries/s1/count');
    expect(withReturnTo('/dashboard/surgeries/s1/count', 'https://evil.example'))
      .toBe('/dashboard/surgeries/s1/count');
  });

  it('carries the query, because a filtered board is a different page', () => {
    expect(currentReturnPath({ pathname: '/dashboard/theatre-reception', search: '?case=s1' }))
      .toBe('/dashboard/theatre-reception?case=s1');
    expect(currentReturnPath({ pathname: '/dashboard/surgeries', search: '' }))
      .toBe('/dashboard/surgeries');
  });
});

describe('reading it back on the page somebody landed on', () => {
  it('takes what the caller said', () => {
    const p = new URLSearchParams({ [RETURN_PARAM]: '/dashboard/theatre-reception?case=s1' });
    expect(readReturnTo(p, '/dashboard/surgeries/s1'))
      .toBe('/dashboard/theatre-reception?case=s1');
  });

  it('accepts a raw query string too', () => {
    expect(readReturnTo(`?${RETURN_PARAM}=%2Fdashboard%2Fholding-area`, '/x'))
      .toBe('/dashboard/holding-area');
  });

  it('falls back when nobody said - a bookmark, or a link from WhatsApp', () => {
    // This is why router.back() was the wrong answer: with no in-app history
    // it takes a staff member out of the application altogether.
    expect(readReturnTo(new URLSearchParams(), '/dashboard/surgeries/s1'))
      .toBe('/dashboard/surgeries/s1');
    expect(readReturnTo(null, '/dashboard/surgeries/s1')).toBe('/dashboard/surgeries/s1');
    expect(readReturnTo(undefined, '/dashboard/surgeries/s1')).toBe('/dashboard/surgeries/s1');
  });

  it('falls back rather than obey a hostile value', () => {
    const p = new URLSearchParams({ [RETURN_PARAM]: 'https://evil.example' });
    expect(readReturnTo(p, '/dashboard/surgeries/s1')).toBe('/dashboard/surgeries/s1');
  });
});

describe('the label names the page it will actually open', () => {
  it('names the boards somebody comes from', () => {
    expect(labelForPath('/dashboard/theatre-reception')).toBe('Theatre Reception');
    expect(labelForPath('/dashboard/theatre-reception?case=s1&date=2026-11-04'))
      .toBe('Theatre Reception');
    expect(labelForPath('/dashboard/holding-area')).toBe('Holding Area');
    expect(labelForPath('/dashboard/preop-reviews')).toBe('Pre-op Reviews');
    expect(labelForPath('/dashboard/preop-reviews/watch')).toBe('the Review Watch');
    expect(labelForPath('/dashboard/surgeries')).toBe('Surgeries');
    expect(labelForPath('/dashboard/surgeries/completed')).toBe('Completed Surgeries');
    expect(labelForPath('/dashboard')).toBe('Dashboard');
  });

  it('distinguishes a case from its sub-pages', () => {
    // "Back to Surgery Details" on a page that opens the surgical count is
    // the same defect wearing different clothes.
    expect(labelForPath('/dashboard/surgeries/abc123')).toBe('Surgery Details');
    expect(labelForPath('/dashboard/surgeries/abc123/count')).toBe('the Surgical Count');
    expect(labelForPath('/dashboard/surgeries/abc123/scribe')).toBe('the safety check');
    expect(labelForPath('/dashboard/surgeries/abc123/post-op-notes')).toBe('the Operation Note');
  });

  it('falls back to the module catalogue rather than a second list', () => {
    expect(labelForPath('/dashboard/pacu')).toBe('PACU (Recovery)');
    expect(labelForPath('/dashboard/call-for-patient')).toBe('Call for Patient');
  });

  it('never returns nothing', () => {
    expect(labelForPath('/some/route/we/never/wrote')).toBe('Dashboard');
    expect(labelForPath('')).toBe('Dashboard');
  });
});

describe('the safety-check findings still round-trip', () => {
  it('carries the origin into the form it sends somebody to', () => {
    const href = resolutionHref('CONSENT_MISSING', 's1', '/dashboard/surgeries/s1/scribe');
    expect(href).toContain(`${RETURN_PARAM}=`);
    expect(href).toContain(encodeURIComponent('/dashboard/surgeries/s1/scribe'));
  });

  it('refuses an off-site origin', () => {
    const href = resolutionHref('CONSENT_MISSING', 's1', 'https://evil.example');
    expect(href).not.toContain('evil.example');
  });
});

// ---- The pages themselves ------------------------------------------------
//
// The rules above are only worth having if the screens use them. These read
// the source, because the bug was never in a function: it was eleven pages
// each confidently going somewhere else.

describe('no surgery sub-page guesses its parent any more', () => {
  const PAGES = [
    'count', 'timing', 'anesthesia', 'bom', 'journey',
    'consumables', 'post-op-notes', 'post-op-prescription',
    'consent', 'preop-data', 'scribe',
  ];

  it.each(PAGES)('%s uses the shared back link', (name) => {
    const src = read(`src/app/dashboard/surgeries/[id]/${name}/page.tsx`);
    expect(src).toContain("import BackLink from '@/components/BackLink'");
    expect(src).toContain('<BackLink');
  });

  it.each(PAGES)('%s no longer hard-codes a destination or calls router.back()', (name) => {
    const src = read(`src/app/dashboard/surgeries/[id]/${name}/page.tsx`);
    // router.back() leaves the application when there is no in-app history,
    // and after a redirect it does not go where the words say.
    expect(src).not.toContain('router.back()');
    expect(src).not.toContain(`${ARROW} Back to Surgery`);
  });

  it('the surgery page itself has one too', () => {
    const src = read('src/app/dashboard/surgeries/[id]/page.tsx');
    expect(src).toContain('<BackLink');
    expect(src).not.toContain('router.back()');
  });

  it('post-op prescription, which had no way back at all, has one now', () => {
    expect(read('src/app/dashboard/surgeries/[id]/post-op-prescription/page.tsx'))
      .toContain('<BackLink');
  });
});

describe('the screens that send people there say where they came from', () => {
  it('the Theatre Reception duty links - the flow in the report', () => {
    const src = read('src/app/dashboard/theatre-reception/page.tsx');
    expect(src).toContain("import { useReturnHere } from '@/lib/navigation/useReturnHere'");
    expect(src).toContain('href={returnHere(l.href)}');
    // A plain anchor reloaded the whole application to open a checklist.
    expect(src).not.toMatch(/<a\s+key=\{l\.href\}/);
  });

  it('the case actions menu, which is eleven links in one place', () => {
    const src = read('src/components/surgeries/CaseActionsMenu.tsx');
    expect(src).toContain('href={returnHere(a.href)}');
  });

  it('the other boards and reports', () => {
    const files = [
      'src/app/dashboard/surgeries/[id]/page.tsx',
      'src/app/dashboard/surgeries/completed/page.tsx',
      'src/app/dashboard/reports/bom/page.tsx',
      'src/app/dashboard/holding-area/[id]/page.tsx',
      'src/app/dashboard/preop-reviews/page.tsx',
      'src/app/dashboard/preop-reviews/watch/page.tsx',
    ];
    for (const f of files) {
      expect(read(f), f).toContain('returnHere(');
    }
  });
});

describe('the reception board can be returned to as it was left', () => {
  const src = read('src/app/dashboard/theatre-reception/page.tsx');

  it('keeps the open case and the day in the address, not only in memory', () => {
    // React state does not survive the round trip, so the board came back
    // showing today with everything collapsed.
    expect(src).toContain("searchParams?.get('case')");
    expect(src).toContain("searchParams?.get('date')");
  });

  it('replaces rather than pushes, so expanding a case is not a page to go back through', () => {
    expect(src).toContain('router.replace(');
  });
});

describe('the same thing was true outside the surgery pages', () => {
  // Fifteen screens walked the browser's history behind a bare arrow. These
  // are the ones with a page-level back button; the form Cancel buttons are
  // left alone deliberately, because "cancel" is a different promise from
  // "back" and discarding a half-typed form is what they are for.
  const CONVERTED = [
    'src/app/dashboard/anonymous-tips/page.tsx',
    'src/app/dashboard/anonymous-tips/view/page.tsx',
    'src/app/dashboard/security-reports/page.tsx',
    'src/app/dashboard/security-reports/view/page.tsx',
    'src/app/dashboard/estimates/[id]/page.tsx',
    'src/app/dashboard/holding-area/[id]/page.tsx',
    'src/app/dashboard/pacu/[id]/page.tsx',
    'src/app/dashboard/patients/[id]/page.tsx',
    'src/app/dashboard/emergency-booking/new/page.tsx',
  ];

  it.each(CONVERTED)('%s has a back link that names where it goes', (f) => {
    expect(read(f)).toContain('<BackLink');
  });

  it('the page-level back buttons no longer walk the history', () => {
    for (const f of CONVERTED) {
      const src = read(f);
      // What remains in a couple of these files is a form's Cancel button,
      // which is a different promise and is deliberately untouched.
      const backs = src.split('router.back()').length - 1;
      const cancels = src.split('Cancel').length - 1;
      expect(backs, f).toBeLessThanOrEqual(cancels);
    }
  });
});

describe('leaving saves what was being written', () => {
  it('the operation note flushes its debounced save before going', () => {
    // A client-side navigation unmounts the page without firing beforeunload,
    // so up to 1.2 seconds of an operation note lived only in the browser.
    const src = read('src/app/dashboard/surgeries/[id]/post-op-notes/page.tsx');
    expect(src).toContain('flushBeforeLeaving');
    expect(src).toContain('onLeave={flushBeforeLeaving}');
    expect(src).toMatch(/await save\(\);/);
    // It must report failure, not navigate away from unsaved text.
    expect(src).toContain('return !dirty.current;');
  });

  it('the back link waits for that, and stays put when the save failed', () => {
    const src = read('src/components/BackLink.tsx');
    expect(src).toContain('await onLeave()');
    expect(src).toContain('if (ok === false)');
    // The catch must not fall through into a navigation.
    const catchBlock = src.slice(src.indexOf('} catch {'), src.indexOf('markReturningTo(href)'));
    expect(catchBlock).toContain('return;');
  });

  it('the back link leaves modified clicks to the browser', () => {
    const src = read('src/components/BackLink.tsx');
    expect(src).toContain('e.metaKey || e.ctrlKey || e.shiftKey');
    expect(src).toContain('e.button !== 0');
  });
});

describe('and lands at the place on the page, not the top of it', () => {
  it('the scroll memory is mounted once, for every dashboard page', () => {
    expect(read('src/app/dashboard/layout.tsx')).toContain('<ScrollMemory />');
  });

  it('restores only after a back link, never on an ordinary visit', () => {
    const src = read('src/components/ScrollMemory.tsx');
    expect(src).toContain('orm.returningTo');
    expect(read('src/components/BackLink.tsx')).toContain('markReturningTo(href)');
  });

  it('never throws out of a navigation when storage is unavailable', () => {
    // Private browsing and blocked site data both make sessionStorage throw.
    const src = read('src/components/ScrollMemory.tsx');
    expect(src.split('sessionStorage.').length - 1).toBeGreaterThan(0);
    expect(src.split('catch').length - 1).toBeGreaterThanOrEqual(4);
  });
});
