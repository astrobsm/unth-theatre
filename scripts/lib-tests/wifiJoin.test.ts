/**
 * The Wi-Fi join code.
 *
 * A malformed payload does not announce itself. The camera either shows no
 * banner at all, or — worse — shows one, joins, and fails with "incorrect
 * password", which sends the person back to typing the very thing this exists
 * to avoid. So the escaping is tested character by character.
 *
 * The password contains none of the delimiters today. It will be changed one
 * day by somebody who does not know that matters, and this is what catches it.
 */
import { describe, expect, it } from 'vitest';

import {
  wifiQrPayload, escapeWifiValue, isTheatreNetwork,
  THEATRE_SSIDS, PRIMARY_SSID, JOIN_STEPS, COMMON_FAILURE,
  WIFI_SECURITY, NETWORK_IS_OPEN, STEPS_FOR_NETWORK, OPEN_NETWORK_STEPS,
} from '../../src/lib/hotspot/wifi';

describe('the payload a camera reads', () => {
  it('is the standard format, terminated properly', () => {
    const p = wifiQrPayload({ ssid: 'UNTH-THEATRE-ORM', password: '93934015' });
    expect(p).toBe('WIFI:T:WPA;S:UNTH-THEATRE-ORM;P:93934015;H:false;;');
    // The trailing double semicolon is not optional.
    expect(p.endsWith(';;')).toBe(true);
  });

  it('escapes every delimiter the format uses', () => {
    // Each of these would otherwise end the field early and produce a password
    // that is silently wrong. String.raw, so the backslashes here are the ones
    // being asserted rather than whatever survived being written to disk.
    expect(escapeWifiValue('a;b')).toBe(String.raw`a\;b`);
    expect(escapeWifiValue('a,b')).toBe(String.raw`a\,b`);
    expect(escapeWifiValue('a:b')).toBe(String.raw`a\:b`);
    expect(escapeWifiValue('a"b')).toBe(String.raw`a\"b`);
    expect(escapeWifiValue('a\\b')).toBe(String.raw`a\\b`);
  });

  it('leaves an ordinary value untouched', () => {
    expect(escapeWifiValue('93934015')).toBe('93934015');
    expect(escapeWifiValue('UNTH-THEATRE-ORM')).toBe('UNTH-THEATRE-ORM');
  });

  it('carries an escaped password through to the payload', () => {
    const p = wifiQrPayload({ ssid: 'NET', password: 'pa;ss:word' });
    expect(p).toContain(String.raw`P:pa\;ss\:word;`);
  });

  it('escapes a network name too', () => {
    // An SSID with a comma is legal and does happen.
    expect(wifiQrPayload({ ssid: 'UNTH, Theatre', password: 'x' }))
      .toContain(String.raw`S:UNTH\, Theatre;`);
  });

  it('leaves the password out entirely for an open network', () => {
    const p = wifiQrPayload({ ssid: 'GUEST', password: 'ignored', security: 'nopass' });
    expect(p).not.toContain('P:');
    expect(p).toContain('T:nopass');
  });

  it('marks a hidden network, because a phone cannot find one otherwise', () => {
    expect(wifiQrPayload({ ssid: 'X', password: 'y', hidden: true })).toContain('H:true');
  });
});

describe('the theatre networks', () => {
  it('has a primary and recognises the family', () => {
    expect(PRIMARY_SSID).toBe('UNTH-THEATRE-ORM');
    expect(THEATRE_SSIDS).toContain('UNTH-THEATRE-ORM');
    expect(isTheatreNetwork('UNTH-THEATRE-ORM')).toBe(true);
    expect(isTheatreNetwork('unth-theatre-orm-ext')).toBe(true);
    expect(isTheatreNetwork('UNTH-GUEST')).toBe(false);
    expect(isTheatreNetwork(null)).toBe(false);
  });

  it('is one network, because every extender rebroadcasts the same name', () => {
    // Deliberate, and worth a test: one name means the phone roams between
    // extenders on its own, and one code goes on every wall instead of one per
    // corridor. Adding a separate SSID here should be a decision somebody
    // makes on purpose, not a default that drifts back.
    expect(THEATRE_SSIDS).toHaveLength(1);
    expect(THEATRE_SSIDS[0]).toBe('UNTH-THEATRE-ORM');
  });

  it('names no network twice', () => {
    expect(new Set(THEATRE_SSIDS).size).toBe(THEATRE_SSIDS.length);
  });

  it('produces a distinct payload for each', () => {
    const payloads = THEATRE_SSIDS.map((s) => wifiQrPayload({ ssid: s, password: '93934015' }));
    expect(new Set(payloads).size).toBe(THEATRE_SSIDS.length);
  });
});

describe('what people are told to do', () => {
  it('warns that the sign-in page may not open by itself', () => {
    // The step people get wrong is the one after joining: they wait, nothing
    // happens, and they decide the network is broken.
    const text = JOIN_STEPS.map((s) => `${s.step} ${s.detail}`).join(' ');
    expect(text).toMatch(/if it does not/i);
    expect(text).toMatch(/unth-theatre\.link/);
  });

  it('says signing in is not two sign-ins', () => {
    const text = JOIN_STEPS.map((s) => s.detail).join(' ');
    expect(text).toMatch(/not signing in twice/i);
  });

  it('tells somebody when to stop retrying and ask', () => {
    // Re-entering a password that is not the problem is the loop this breaks.
    expect(COMMON_FAILURE.fix).toMatch(/do not keep re-entering/i);
    expect(COMMON_FAILURE.fix).toMatch(/theatre manager/i);
  });
});

describe('the switch between a password and an open network', () => {
  it('agrees with itself', () => {
    expect(NETWORK_IS_OPEN).toBe(WIFI_SECURITY === 'nopass');
    expect(STEPS_FOR_NETWORK).toBe(NETWORK_IS_OPEN ? OPEN_NETWORK_STEPS : JOIN_STEPS);
  });

  it('is still WPA, because the theatre server has no TLS certificate', () => {
    // Deliberate and load-bearing. On an open network nothing encrypts the
    // radio, and the portal sends the ORM password in clear — the credentials
    // to a system holding patient records. WPA2 is the only thing protecting
    // them until the server is on HTTPS or the SSID moves to WPA3 OWE.
    // scripts/local-server/README.md carries the full reasoning.
    expect(WIFI_SECURITY).toBe('WPA');
    expect(NETWORK_IS_OPEN).toBe(false);
  });

  it('tells people there is no password once it is opened', () => {
    // The open-network steps must not still mention one.
    const text = OPEN_NETWORK_STEPS.map((s) => `${s.step} ${s.detail}`).join(' ');
    expect(text).toMatch(/no network password/i);
    expect(text).not.toMatch(/tap the banner/i);
    expect(text).toMatch(/not signing in twice/i);
  });

  it('drops the password from the payload when opened', () => {
    expect(wifiQrPayload({ ssid: PRIMARY_SSID, password: 'x', security: 'nopass' }))
      .not.toContain('P:');
  });
});
