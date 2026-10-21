/**
 * Which voice reads a theatre announcement.
 *
 * Reported from Ituku-Ozalla: the announcements do not sound Nigerian, and
 * two voices — one male, one female — read the same notice almost on top of
 * each other.
 *
 * Both had the same root. The neural engine (Kokoro) ships American and
 * British voices only; its default, af_heart, is an American woman. That was
 * the preferred engine. The device's own voice was the fallback, and on a
 * Windows machine that is usually a man. So the hospital got an American
 * woman, a British-or-American man, and on a bad handover both at once.
 *
 * The scoring is read out of the source rather than executed, because
 * picking a voice needs a live speechSynthesis the test runner has not got.
 * What is checked is the thing that was actually wrong: the RANKING.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const humanVoice = read('src/lib/humanVoice.ts');
const radioTts = read('src/lib/radioTts.ts');
const kokoro = read('src/lib/kokoroTts.ts');

/** A number assigned to a name in the source, e.g. `const X = 1000;`. */
function constant(src: string, name: string): number {
  const m = new RegExp(`const ${name}\\s*=\\s*(\\d+)`).exec(src);
  expect(m, `${name} not found`).not.toBeNull();
  return Number(m![1]);
}

describe('a Nigerian voice outranks a smoother foreign one', () => {
  it('scores en-NG far above any quality bonus', () => {
    // THE BUG. A 60-point locale nudge lost to a 100-point "Natural" bonus,
    // so a device holding en-NG-EzinneNeural AND an American natural voice
    // chose the American one.
    const nigerian = constant(humanVoice, 'NIGERIAN_BONUS');
    const quality = Math.max(
      ...Array.from(humanVoice.matchAll(/\[\/(?:natural|neural|premium|enhanced|siri|google)\/i,\s*(\d+)\]/gi))
        .map((m) => Number(m[1])),
    );
    expect(quality).toBeGreaterThan(0);
    // Not merely ahead: ahead by more than every other bonus combined, so no
    // accumulation of nice properties can overturn it.
    expect(nigerian).toBeGreaterThan(quality * 4);
  });

  it('still prefers English over a non-English voice', () => {
    expect(humanVoice).toMatch(/score -= 200/);
  });

  it('settles on ONE Nigerian voice so two devices agree', () => {
    // Two devices picking different Nigerian voices is the male/female
    // complaint in another form.
    expect(humanVoice).toMatch(/NIGERIAN_VOICE_ORDER/);
    const order = /NIGERIAN_VOICE_ORDER[^=]*=\s*\[([^\]]*)\]/.exec(humanVoice);
    expect(order).not.toBeNull();
    expect(order![1]).toMatch(/ezinne/i);
    expect(order![1]).toMatch(/abeo/i);
    // Ezinne first: the order is arbitrary, agreeing on one is not.
    expect(order![1].indexOf('ezinne')).toBeLessThan(order![1].indexOf('abeo'));
  });
});

describe('the neural engine stands aside for a Nigerian voice', () => {
  it('Kokoro has no Nigerian voice to offer', () => {
    // The premise of the change. If this ever stops being true the
    // preference below should be revisited rather than left in place.
    expect(kokoro).toMatch(/af_heart/);
    expect(kokoro).not.toMatch(/en[-_]NG/i);
  });

  it('is skipped when the device has one', () => {
    expect(radioTts).toMatch(/hasNigerianVoice\(\)/);
    const check = radioTts.indexOf('if (hasNigerianVoice()) return false;');
    // The CALL, not the import at the top of the file. An earlier draft of
    // this test matched the import and reported the guard as running late.
    const kokoroCall = radioTts.indexOf('await speakViaKokoro(');
    expect(check).toBeGreaterThan(0);
    // Before any neural attempt, so nothing has started playing and there is
    // nothing to silence.
    expect(check).toBeLessThan(kokoroCall);
  });
});

describe('an engine that fails must stop making a sound', () => {
  it('pauses and clears its audio before resolving false', () => {
    // The overlap. Resolving false sends the caller to the device voice
    // immediately; if this element is still playing the room hears both.
    for (const [name, src] of [['kokoroTts', kokoro], ['radioTts', radioTts]] as const) {
      expect(src, `${name} does not silence itself`).toMatch(/if \(!ok && audio\)/);
      expect(src, `${name} does not pause`).toMatch(/audio\.pause\(\)/);
    }
  });

  it('does not silence a SUCCESSFUL finish', () => {
    // Guarded on !ok. Pausing on success would cut the last word off every
    // announcement, which is a worse bug than the one being fixed.
    for (const src of [kokoro, radioTts]) {
      expect(src).not.toMatch(/settled = true;\s*\n\s*try \{ audio\.pause/);
    }
  });
});
