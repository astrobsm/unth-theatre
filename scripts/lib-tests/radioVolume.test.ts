/**
 * Turning the theatre radio down from somewhere else.
 *
 * The feature is easy; the floor is the whole of it. Whoever sets this is by
 * definition not in the room, cannot hear the result, and the failure mode is
 * silent — an announcement played at zero still plays, the player marks it
 * delivered, the queue retires it, and nobody in theatre ever hears it.
 *
 * That exact fault already happened once with the per-device mute, and the
 * comment left behind when it was fixed is the clearest statement of it: "a
 * muted emergency was therefore not merely silent, it was consumed". A remote
 * control is the same bug with a longer reach.
 *
 * So most of what follows is about the one thing a volume control must refuse
 * to do.
 */
import { describe, expect, it } from 'vitest';

import {
  clampVolume, effectiveVolume, willBeAudible, describeVolume,
  EMERGENCY_FLOOR, DEFAULT_VOLUME,
} from '../../src/lib/radio/volume';

describe('an emergency can never be silenced from a distance', () => {
  it('is lifted to the floor when the radio is turned right down', () => {
    expect(effectiveVolume({ volume: 0 }, true)).toBe(EMERGENCY_FLOOR);
    expect(effectiveVolume({ volume: 0.1 }, true)).toBe(EMERGENCY_FLOOR);
  });

  it('ignores a hospital-wide routine mute entirely', () => {
    // The mute does not apply to it at all, so a radio otherwise at full
    // volume plays the emergency at FULL volume. The floor is a minimum, not
    // a target: pulling a loud radio down to 0.5 because the case is urgent
    // would be the wrong way round.
    expect(effectiveVolume({ volume: 1, routineMuted: true }, true)).toBe(1);
    expect(effectiveVolume({ volume: 0, routineMuted: true }, true)).toBe(EMERGENCY_FLOOR);
    expect(effectiveVolume({ volume: 0.2, routineMuted: true }, true)).toBe(EMERGENCY_FLOOR);
  });

  it('is always audible, whatever the setting says', () => {
    for (const setting of [
      { volume: 0 }, { volume: 0, routineMuted: true }, { volume: -5 },
      { volume: NaN }, {}, null, undefined,
    ]) {
      expect(willBeAudible(setting, true), JSON.stringify(setting)).toBe(true);
    }
  });

  it('is not made LOUDER than the radio was set to', () => {
    // The floor lifts a quiet radio; it does not override a loud one
    // downwards or shout over a deliberate setting above it.
    expect(effectiveVolume({ volume: 0.8 }, true)).toBe(0.8);
    expect(effectiveVolume({ volume: 1 }, true)).toBe(1);
  });

  it('keeps the floor somewhere a corridor can hear', () => {
    expect(EMERGENCY_FLOOR).toBeGreaterThanOrEqual(0.5);
    expect(EMERGENCY_FLOOR).toBeLessThanOrEqual(1);
  });
});

describe('routine traffic does what it is told', () => {
  it('plays at the set volume', () => {
    expect(effectiveVolume({ volume: 0.3 }, false)).toBe(0.3);
    expect(effectiveVolume({ volume: 1 }, false)).toBe(1);
  });

  it('can be taken all the way to silence', () => {
    // Deliberate: this is the point of the feature, and a routine
    // announcement nobody hears costs a repeat, not a patient.
    expect(effectiveVolume({ volume: 0 }, false)).toBe(0);
    expect(willBeAudible({ volume: 0 }, false)).toBe(false);
  });

  it('is silenced by the hospital-wide routine mute', () => {
    expect(effectiveVolume({ volume: 1, routineMuted: true }, false)).toBe(0);
  });
});

describe('a setting that cannot be read', () => {
  it('falls back to full volume, not to zero', () => {
    // A radio that went quiet because a number would not parse is
    // indistinguishable from a radio nobody is using. It must fail loud.
    for (const bad of [undefined, null, NaN, 'loud', {}, Infinity, -Infinity]) {
      expect(clampVolume(bad), String(bad)).toBe(DEFAULT_VOLUME);
    }
    expect(effectiveVolume(null, false)).toBe(DEFAULT_VOLUME);
    expect(effectiveVolume({}, false)).toBe(DEFAULT_VOLUME);
  });

  it('clamps a value from outside the range rather than passing it on', () => {
    // An <audio> element throws on a volume outside 0..1, which would stop
    // playback altogether rather than merely play it at the wrong level.
    expect(clampVolume(-0.4)).toBe(0);
    expect(clampVolume(4)).toBe(1);
    expect(clampVolume('0.25')).toBe(0.25);
  });

  it('keeps a real zero as zero', () => {
    // 0 is falsy, and a `|| DEFAULT` would quietly turn a deliberate silence
    // back up to full.
    expect(clampVolume(0)).toBe(0);
    expect(effectiveVolume({ volume: 0 }, false)).toBe(0);
  });
});

describe('what the admin screen says', () => {
  it('states the consequence, not the number', () => {
    // "40%" tells somebody at home nothing about a corridor they cannot hear.
    const quiet = describeVolume({ volume: 0.4 });
    expect(quiet).toMatch(/Emergencies are raised/);
    expect(quiet).toMatch(/50%/);
  });

  it('is explicit that silence does not include emergencies', () => {
    for (const s of [{ volume: 0 }, { volume: 1, routineMuted: true }]) {
      expect(describeVolume(s)).toMatch(/Emergencies still sound/);
    }
  });

  it('says nothing alarming at full volume', () => {
    expect(describeVolume({ volume: 1 })).toBe('Full volume.');
    expect(describeVolume(null)).toBe('Full volume.');
  });

  it('does not promise a lift that is not happening', () => {
    // At or above the floor nothing is raised, so it must not claim to be.
    expect(describeVolume({ volume: 0.7 })).not.toMatch(/raised/);
  });
});
