/**
 * The script that re-bases an already-booked case onto the current mandatory
 * pack. It is the only thing in this repo that DELETES a pack line, so what
 * these tests hold is the set of lines it must never reach.
 *
 * Why deletion is on the table here at all, when the schema says plainly that
 * nothing is deleted: the rationale given there is "the provider may already
 * have picked it", and `status` is the record of whether they have. A
 * REQUESTED line has not been picked, and — the part that matters — was never
 * chosen by anybody. It was a standing default which the hospital has now
 * replaced. Cancelling eighteen such lines per case would leave the old pack
 * with lines through it rather than the new pack, which is the thing that was
 * reported in the first place.
 *
 * None of that excuses touching a line somebody is acting on, or a line
 * somebody chose. Hence the asserted boundaries below.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveBasePack, BASE_PACK_LABEL } from '../../src/lib/baseConsumablePack';

const REPO = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(REPO, 'scripts/rebase-case-packs.ts'), 'utf8');

/** Source with comment lines stripped, for assertions about absence. */
const code = SRC.split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('what it is allowed to touch', () => {
  it('considers only rows stamped as the base pack', () => {
    // A line a surgeon added, a line from an applied pack, a line the standard
    // composed for this operation — none were put there by a default.
    expect(code).toContain('rows.filter((r) => r.notes === BASE_PACK_LABEL)');
  });

  it('decides what belongs from resolveBasePack, not a second copy of the list', () => {
    // A list written out twice is a list that disagrees with itself, and this
    // one decides what gets deleted.
    expect(code).toContain('resolveBasePack(c.magnitude)');
    expect(code).not.toMatch(/Surgical face masks|Sterile surgical gowns/);
  });

  it('never deletes a line the provider has acted on', () => {
    // Those gowns are physically on a trolley. The list must go on saying so.
    expect(code).toContain("const ACTED_ON = ['PACKING', 'PACKED', 'DELIVERED'];");
    expect(code).toContain('supersededFree = superseded.filter((r) => !ACTED_ON.includes');
    // And the delete is driven by that filtered set, never by `superseded`.
    const del = code.slice(code.indexOf('deleteMany'), code.indexOf('deleteMany') + 220);
    expect(del).toContain('supersededFree.map((r) => r.id)');
  });

  it('leaves an already-cancelled line cancelled', () => {
    // Re-deleting a withdrawn line would lose the reason it was withdrawn for.
    expect(code).toContain("&& String(r.status).toUpperCase() !== 'CANCELLED'");
  });

  it('does not re-add something the case already has under another source', () => {
    // If a surgeon asked for examination gloves by hand, the base pack must
    // not put a second line beside it.
    expect(code).toContain('const presentNames = new Set(rows.map((r) => key(r.name)));');
    expect(code).toContain('want.filter((w) => !presentNames.has(key(w.name)))');
  });

  it('skips cases that are finished', () => {
    expect(code).toContain("status: { notIn: ['COMPLETED', 'CANCELLED'] }");
  });

  it('writes nothing without --write', () => {
    expect(code).toContain("const WRITE = process.argv.includes('--write');");
    expect(code).toContain('if (!WRITE) continue;');
  });

  it('offers withdrawal instead of deletion for anyone who wants the trail', () => {
    expect(code).toContain("const CANCEL_ONLY = process.argv.includes('--cancel-only');");
    expect(code).toContain('removalReason:');
  });

  it('stamps what it adds, so the next pack change can find it', () => {
    // An unstamped line would be invisible to this script next time, and would
    // survive a future replacement as a stray.
    const add = code.slice(code.indexOf('missing.map((w) =>'));
    expect(add.slice(0, 600)).toContain('notes: BASE_PACK_LABEL');
  });
});

describe('the pack it re-bases onto', () => {
  it('is the one every other part of the system uses', () => {
    const major = resolveBasePack('MAJOR').map((i) => i.name);
    expect(major).toContain('Surgical gloves, sterile');
    expect(major).toContain('IV cannula, grey (ash)');
    expect(major).not.toContain('Sterile surgical gowns');
    expect(BASE_PACK_LABEL).toBe('Mandatory base theatre pack');
  });

  it('corrects a quantity that moved rather than leaving the old one', () => {
    // Examination gloves went from 20 pairs to 1 pack. A line that keeps its
    // name but changes its count would otherwise never be updated.
    expect(code).toContain('r.quantity !== w.quantity || r.unit !== w.unit');
    expect(code).toContain('data: { quantity: w.quantity, unit: w.unit, size: w.size ?? null }');
  });
});
