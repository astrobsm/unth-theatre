/**
 * A long server job is not an offline write.
 *
 * WHAT THIS IS PROTECTING, AND WHY IT IS WORTH THE LINES. Every mutation in
 * ORM passes through one interceptor that gives it thirty seconds, then files
 * it on the device and answers the caller "Saved on this device. It will sync
 * automatically when you are back online."
 *
 * That is exactly right for a booking written in a corridor with no signal. It
 * is exactly wrong for a request asking the server to work for five minutes:
 * on 27 November 2026 the Chairman pressed "Run the analysis", was told it had
 * been saved, and watched a card that never moved -- because the press was
 * being filed on his own computer and never reaching the server at all. Worse,
 * the queue is durable and replays what it holds, and replaying this one
 * starts another PAID run; the replay then times out at thirty seconds and is
 * queued again.
 *
 * These tests pin the exemption, in the predicate and at both places that
 * would otherwise swallow or repeat the request.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { isLongServerJob } from '../../src/lib/blockers/catalogue';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('which requests are long server jobs', () => {
  const id = 'd24692b2-2355-4b1e-84b0-056a7359100c';

  it('recognises the policy analysis run, however the URL is written', () => {
    expect(isLongServerJob(`/api/policy/rounds/${id}/analysis`)).toBe(true);
    expect(isLongServerJob(`https://unth-theatre.link/api/policy/rounds/${id}/analysis`)).toBe(true);
    expect(isLongServerJob(`/api/policy/rounds/${id}/analysis?resume=1`)).toBe(true);
  });

  it('does not sweep in the rest of the module', () => {
    // Reading the round, saving a response, inviting a member: ordinary work
    // that MUST keep its offline queue. Over-matching here would quietly
    // remove offline support from a committee member on hospital wifi.
    expect(isLongServerJob(`/api/policy/rounds/${id}`)).toBe(false);
    expect(isLongServerJob(`/api/policy/rounds/${id}/responses`)).toBe(false);
    expect(isLongServerJob(`/api/policy/rounds/${id}/analysis/accept`)).toBe(false);
    expect(isLongServerJob('/api/surgeries')).toBe(false);
    expect(isLongServerJob('/api/pacu/123/vitals')).toBe(false);
  });

  it('does not throw on a URL it cannot parse', () => {
    expect(isLongServerJob('')).toBe(false);
    expect(isLongServerJob('not a url at all')).toBe(false);
  });
});

describe('the interceptor lets it past', () => {
  const code = read('src/lib/globalFetchInterceptor.ts');

  it('sends it straight to the network, BEFORE the mutation handler', () => {
    // Order is the whole point: reaching handleMutationFetch is reaching the
    // deadline, the queue and the synthetic "saved" answer.
    const exempt = code.indexOf('if (isLongServerJob(url)) {');
    const mutate = code.indexOf('if (isMutation(init)) {');
    expect(exempt).toBeGreaterThan(-1);
    expect(mutate).toBeGreaterThan(-1);
    expect(exempt).toBeLessThan(mutate);
  });

  it('still deadlines ordinary mutations, which is why the exemption is needed', () => {
    // If this ever stops being true the exemption is pointless, and whoever
    // removes it should have to change this line and think about why.
    expect(code).toContain('const MUTATION_DEADLINE_MS = 30_000;');
  });
});

describe('the queue never replays one', () => {
  const code = read('src/lib/offlineStore.ts');

  it('drops a queued analysis instead of sending it again', () => {
    // A device that ran the old code is still holding these. Each replay is
    // another paid run, and the reply it gets is another thirty-second
    // timeout, which queues it again.
    expect(code).toContain('if (isLongServerJob(rawItem.url)) {');
    expect(code).toContain('await removeFromOfflineQueue(rawItem.id!);');
  });

  it('drops it before anything decides to send it', () => {
    const drop = code.indexOf('if (isLongServerJob(rawItem.url)) {');
    const send = code.indexOf('const response = await fetch(item.url, {');
    expect(drop).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(send);
  });

  it('clears the device record too, so the badge stops claiming unsent work', () => {
    expect(code).toContain("await removePendingByIdempotencyKey(rawItem.headers?.['X-Idempotency-Key']);");
  });
});
