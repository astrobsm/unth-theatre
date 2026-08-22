import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// vercel.json is strict JSON validated against a schema at deploy time, and an
// unknown property does not warn — it fails the whole deployment.
//
// On 22 August 2026 a cron entry was given an explanatory "_comment" key. Every
// push for the next nine commits was rejected, and because the theatre server
// deploys separately and kept working, nothing looked wrong: the hospital Wi-Fi
// served the current build while everyone off-site got a build from before any
// of it. It was found only when somebody said they could not see a change.
//
// These tests are cheap and catch that whole class before it ships.

const config = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
) as Record<string, unknown>;

describe('vercel.json cron entries', () => {
  const crons = (config.crons ?? []) as Array<Record<string, unknown>>;

  it('there are some', () => {
    expect(crons.length).toBeGreaterThan(0);
  });

  it('carry ONLY path and schedule — no comments, no extra keys', () => {
    const offenders = crons
      .map((c, i) => ({ i, path: c.path, extra: Object.keys(c).filter((k) => k !== 'path' && k !== 'schedule') }))
      .filter((o) => o.extra.length > 0);

    // Named in the failure message, because "expected 1 to be 0" would send the
    // next person hunting through forty lines of JSON.
    expect(
      offenders,
      `vercel.json crons with invalid keys: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it('every entry has both a path and a schedule', () => {
    for (const c of crons) {
      expect(typeof c.path).toBe('string');
      expect(typeof c.schedule).toBe('string');
    }
  });

  it('every path is rooted at /api', () => {
    for (const c of crons) {
      expect(String(c.path).startsWith('/api/')).toBe(true);
    }
  });

  it('every schedule has five cron fields', () => {
    for (const c of crons) {
      expect(String(c.schedule).trim().split(/\s+/)).toHaveLength(5);
    }
  });
});

describe('vercel.json overall', () => {
  it('has no underscore-prefixed keys anywhere', () => {
    const found: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (k.startsWith('_')) found.push(`${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
      }
    };
    walk(config, '$');
    expect(found, `underscore keys found: ${found.join(', ')}`).toEqual([]);
  });
});
