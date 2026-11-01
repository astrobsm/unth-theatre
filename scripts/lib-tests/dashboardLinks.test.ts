// ============================================================
// Every in-app link must lead to a page that exists
// ------------------------------------------------------------
// A doctor on the ward opened the anaesthetists' compulsory morning card,
// pressed "Open Anaesthesia", and got a 404. The card had pointed at
// /dashboard/anaesthesia since the day it was written, and that route has
// never existed. It was the second time: /dashboard/queries did the same to
// every queried member of staff, and was fixed by hand, with a comment, and
// nothing stopped the next one.
//
// Nothing stops it because a link is a string. TypeScript cannot check it,
// the build will not complain, and a dead one is invisible until somebody
// standing in a corridor presses it.
//
// So this test reads every /dashboard/... string literal in the source and
// resolves it against the filesystem, exactly as Next's router would. It is
// the only check of its kind in the suite, and the reason the rule holds.
//
// A link that is deliberately not a page — an access-control prefix — belongs
// in PREFIX_ONLY_PATHS in src/lib/modules.ts, where the offline warm-up
// already reads it from. It does not belong in an exception list here.
// ============================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PREFIX_ONLY_PATHS } from '@/lib/modules';
import { ROLE_DUTIES } from '@/lib/dashboard/personalBoard';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const APP_DASHBOARD = path.join(SRC, 'app', 'dashboard');

/** Every /dashboard route that has a page.tsx, as Next sees it. */
function routes(dir = APP_DASHBOARD, prefix = '/dashboard'): string[] {
  const out: string[] = [];
  if (fs.existsSync(path.join(dir, 'page.tsx'))) out.push(prefix);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Route groups "(name)" and private folders "_name" are not path segments.
    if (entry.name.startsWith('_')) continue;
    const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
    out.push(...routes(path.join(dir, entry.name), prefix + segment));
  }
  return out;
}

const ROUTES = routes();

/** '/dashboard/surgeries/[id]/consent' -> matches '/dashboard/surgeries/X/consent'. */
const MATCHERS = ROUTES.map((r) => new RegExp(
  `^${r.split('/').map((s) => {
    if (s.startsWith('[...') || s.startsWith('[[...')) return '.+';
    if (s.startsWith('[')) return '[^/]+';
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/')}$`,
));

const resolves = (link: string) => MATCHERS.some((m) => m.test(link));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Every /dashboard/... literal in the source, with ${…} reduced to a segment.
 *
 * Quoted and backtick strings both, because half the dead links found when
 * this test was written were template literals carrying a record id — which
 * is to say, the "View" button on a list.
 */
function links(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const literal = /['"`](\/dashboard\/(?:[^'"`\s?#]|\$\{[^}]*\})*)/g;
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = literal.exec(text)) !== null) {
      const link = m[1].replace(/\$\{[^}]*\}/g, 'X').replace(/\/$/, '');
      if (!found.has(link)) found.set(link, new Set());
      found.get(link)!.add(path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  return found;
}

describe('dashboard routes', () => {
  it('finds the pages on disk', () => {
    // A sanity check on the walker itself: if this ever returns nothing, every
    // other assertion in this file would pass by accident.
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES).toContain('/dashboard');
    expect(ROUTES).toContain('/dashboard/surgeries');
  });

  it('matches a dynamic segment', () => {
    expect(resolves('/dashboard/surgeries/abc-123')).toBe(true);
    expect(resolves('/dashboard/surgeries/abc-123/consent')).toBe(true);
    expect(resolves('/dashboard/nothing-of-the-sort')).toBe(false);
  });
});

describe('every link in the app leads somewhere', () => {
  it('has no /dashboard link without a page', () => {
    const dead: string[] = [];
    links().forEach((files, link) => {
      if (resolves(link)) return;
      if (PREFIX_ONLY_PATHS.includes(link)) return;
      dead.push(`${link}   <- ${Array.from(files).sort().join(', ')}`);
    });
    expect(dead.sort()).toEqual([]);
  });
});

describe('the personal board', () => {
  // These are the cards a person is shown every morning and cannot dismiss.
  // Both of the anaesthetists' two led to a 404.
  it('sends every standing duty to a page that exists', () => {
    const dead = ROLE_DUTIES.filter((d) => !resolves(d.actionUrl))
      .map((d) => `${d.id} -> ${d.actionUrl}`);
    expect(dead).toEqual([]);
  });

  it('addresses every standing duty to a real role', () => {
    // Read from the schema rather than a copy of it: a role list that drifts
    // from the enum is how the recovery-escort card came to be addressed to
    // RECOVERY_NURSE, NURSE_ANAESTHETIST and PACU_NURSE — none of which exist,
    // so it reached nobody and no test noticed.
    const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    const block = /enum UserRole \{([\s\S]*?)\n\}/.exec(schema);
    expect(block).toBeTruthy();
    const roles = new Set(
      block![1].split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[A-Z][A-Z_]*$/.test(l)),
    );
    expect(roles.size).toBeGreaterThan(30);

    const unknown: string[] = [];
    ROLE_DUTIES.forEach((d) => {
      d.roles.forEach((r) => { if (!roles.has(r)) unknown.push(`${d.id}: ${r}`); });
      if (d.roles.length === 0) unknown.push(`${d.id}: addressed to nobody`);
    });
    expect(unknown).toEqual([]);
  });
});
