import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// On 19 November the worker spent fourteen minutes without completing a
// single cycle. The deferred-retry step took the 200 OLDEST parked entries
// every time with no backoff, and 325 of them had been failing for weeks —
// two records claiming one identity, which no retry can heal. Being the
// oldest, they filled all 200 places for ever: 200 failing round trips a
// minute, 0 applied, running BEFORE the push. The theatre list never reached
// the cloud.

const root = join(__dirname, '..', '..');
const worker = readFileSync(join(root, 'scripts/local-server/sync-worker.ts'), 'utf8');

describe('the deferred queue cannot starve the push', () => {
  it('backs off entries that have stopped making progress', () => {
    const q = worker.slice(worker.indexOf('async function retryDeferred'));
    const select = q.slice(0, q.indexOf('`', q.indexOf('from sync_deferred')));
    expect(select).toContain('attempts <');
    expect(select).toContain('last_try_at');
  });

  it('still retries them, rather than dropping them', () => {
    // A stuck entry heals the moment what it was waiting for arrives, and
    // discarding a change is the one outcome worse than a stuck one.
    expect(worker).toContain('STUCK_RETRY_INTERVAL');
    const q = worker.slice(worker.indexOf('async function retryDeferred'));
    expect(q).not.toMatch(/delete\s+from\s+sync_deferred/i);
    expect(q.slice(0, 1200)).not.toMatch(/set\s+resolved_at\s*=\s*now\(\)\s*where\s+attempts/i);
  });

  it('keeps taking the oldest first among those that can still progress', () => {
    const q = worker.slice(worker.indexOf('async function retryDeferred'));
    expect(q.slice(0, 900)).toContain('order by first_seen_at');
  });
});
