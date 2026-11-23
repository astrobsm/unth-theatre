/**
 * Not turning every server fault into a message about JSON.
 *
 * `await res.json()` on a platform error page throws
 *
 *     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * and that is what the user is shown. It names JSON, so it reads as a data
 * problem; it names a '<', so it reads as something malformed. Neither is
 * true — the request never reached the handler at all — and the one number
 * that would say which fault it was, the status, is the one thing the message
 * leaves out.
 *
 * The research dashboard showed exactly that for a query that was simply too
 * large, and the message sent the reader to look at the parser.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { httpFailureMessage, looksLikeHtml, readJson } from '../../src/lib/http/readJson';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** A Response, without needing a server. */
const res = (status: number, body: string, contentType = 'text/html') =>
  new Response(body, { status, headers: { 'content-type': contentType } });

const HTML = '<!DOCTYPE html><html><head><title>504</title></head><body>…</body></html>';

describe('spotting a web page where data was expected', () => {
  it('recognises the usual shapes', () => {
    expect(looksLikeHtml(HTML)).toBe(true);
    expect(looksLikeHtml('  <html lang="en">')).toBe(true);
    expect(looksLikeHtml('<?xml version="1.0"?>')).toBe(true);
  });

  it('does not mistake JSON for one', () => {
    expect(looksLikeHtml('{"error":"nope"}')).toBe(false);
    expect(looksLikeHtml('[]')).toBe(false);
    expect(looksLikeHtml('')).toBe(false);
  });
});

describe('what the message says', () => {
  it('always carries the status', () => {
    // An operator reading a screenshot can do nothing with "failed". 504 and
    // 403 send them to completely different places, and the difference costs
    // one number.
    for (const s of [403, 404, 500, 502, 504]) {
      expect(httpFailureMessage({ status: s })).toContain(String(s));
    }
  });

  it('treats a timeout as "too big", because that is what it means here', () => {
    const m = httpFailureMessage({ status: 504, doing: 'load the analytics' });
    expect(m).toContain('took too long');
    expect(m).toContain('too many cases');
    expect(m).toContain('From and To');
  });

  it('tells somebody whose session has gone what to do about it', () => {
    expect(httpFailureMessage({ status: 401 })).toContain('Sign in again');
  });

  it('points a refused reader at the board that can grant access', () => {
    expect(httpFailureMessage({ status: 403 })).toContain('Theatre Research Board');
  });

  it('suggests a version mismatch on a 404 rather than blaming the data', () => {
    expect(httpFailureMessage({ status: 404 })).toContain('older version');
  });

  it('says a web page arrived when the status alone would not explain it', () => {
    const m = httpFailureMessage({ status: 200, body: HTML });
    expect(m).toContain('web page instead of data');
  });

  it('never mentions JSON, a token, or a doctype', () => {
    // The whole point. Those three words are what sent the last reader to the
    // wrong place.
    for (const s of [401, 403, 404, 413, 500, 504]) {
      const m = httpFailureMessage({ status: s, body: HTML, doing: 'load the analytics' });
      expect(m).not.toMatch(/JSON|token|DOCTYPE/i);
    }
  });

  it('names what was being attempted, when it was given one', () => {
    expect(httpFailureMessage({ status: 500, doing: 'run the query' }))
      .toContain('run the query');
  });
});

describe('reading a response', () => {
  it('returns the data when it is data', async () => {
    const out = await readJson<{ total: number }>(
      res(200, '{"total":7}', 'application/json'),
    );
    expect(out.total).toBe(7);
  });

  it('prefers the handler\'s own words when it failed properly', async () => {
    // A route that caught its own error knows why it refused, and anything
    // composed here would be a worse answer arriving on top of a better one.
    await expect(readJson(res(500, '{"error":"Failed to generate analytics"}', 'application/json')))
      .rejects.toThrow('Failed to generate analytics');
  });

  it('explains an HTML error page instead of blaming the parser', async () => {
    await expect(readJson(res(504, HTML), 'load the analytics'))
      .rejects.toThrow(/took too long/);
  });

  it('explains a 200 that is somehow not JSON', async () => {
    // A sign-in page or a proxy standing in for the route.
    await expect(readJson(res(200, HTML))).rejects.toThrow(/web page instead of data/);
  });

  it('does not leave the caller with an empty message', async () => {
    const e = await readJson(res(502, '')).catch((err: Error) => err);
    expect((e as Error).message.length).toBeGreaterThan(10);
  });
});

describe('the query that broke the dashboard', () => {
  const route = read('src/app/api/research/route.ts');

  it('projects the columns it needs instead of every column there is', () => {
    // `include` adds relations WITHOUT narrowing the scalars, so all ~150
    // Surgery columns came back for every surgery ever booked -- consent text,
    // comorbidity lists, remarks, the lot. The query grew with the theatre
    // until it stopped fitting in a request.
    const at = route.indexOf('function fetchSurgeries');
    expect(at).toBeGreaterThan(-1);
    const body = route.slice(at, at + 2600);
    expect(body).toContain('select: {');
    expect(body).not.toMatch(/^\s{4}include: \{/m);
  });

  it('still reads every field the row shape is built from', () => {
    const at = route.indexOf('function fetchSurgeries');
    const body = route.slice(at, at + 2600);
    for (const field of [
      'id', 'scheduledDate', 'createdAt', 'status', 'surgeryType', 'subspecialty',
      'unit', 'location', 'surgeonId', 'surgeonName', 'anesthetistId', 'anesthesiaType',
      'complexityScore', 'complexityClass', 'estimatedDuration', 'knifeOnSkinTime',
      'surgeryEndTime', 'actualStartTime', 'actualEndTime',
    ]) {
      expect(body).toContain(`${field}: true`);
    }
  });

  it('keeps the five relations the row shape reads', () => {
    const at = route.indexOf('function fetchSurgeries');
    const body = route.slice(at, at + 2600);
    for (const rel of ['patient', 'surgeon', 'anesthetist', 'cancellation', 'intraOperativeRecord']) {
      expect(body).toContain(`${rel}: {`);
    }
  });

  it('is read through readJson on the page, not res.json()', () => {
    const page = read('src/app/dashboard/research/page.tsx');
    expect(page).toContain("from '@/lib/http/readJson'");
    expect(page).not.toContain('await res.json()');
  });
});
