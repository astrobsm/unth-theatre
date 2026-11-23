/**
 * Devices kept signed in to the theatre Wi-Fi.
 *
 * Two things here are worth a test rather than a careful read.
 *
 * THE MAC COMPARISON. The portal writes a row from the address in a query
 * string; the RADIUS bridge looks that row up from the address in a UDP
 * packet. Routers, phones and people write MAC addresses in at least four
 * ways, and if the two sides normalise differently the enrolment is stored
 * and never found again — a feature that silently does nothing, for one
 * handset, which is the hardest kind of fault to be told about.
 *
 * THE THREE WAYS TO STOP BEING REMEMBERED. Unticked, revoked, lapsed. They
 * are separate fields on purpose, and each one on its own has to be enough.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  MAX_SESSIONS_PER_STAFF,
  PROFILE_ONE_VISIT, PROFILE_REMEMBERED, REMEMBERED_SESSION_SECONDS, REMEMBER_DAYS,
  SESSION_SECONDS, deviceLabel, expiryFrom, grantFor, isRemembered, normaliseMac,
  rememberedUntil, type EnrolledDevice,
} from '../../src/lib/hotspot/devices';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const NOW = new Date('2026-11-02T09:00:00.000Z');

const device = (over: Partial<EnrolledDevice> = {}): EnrolledDevice => ({
  mac: 'A4:B1:C2:D3:E4:F5',
  userId: 'u1',
  remembered: true,
  expiresAt: new Date('2027-01-31T09:00:00.000Z'),
  revokedAt: null,
  ...over,
});

describe('one spelling of a MAC address', () => {
  it('reads every form a router or a person writes', () => {
    const want = 'A4:B1:C2:D3:E4:F5';
    for (const raw of [
      'A4:B1:C2:D3:E4:F5',
      'a4:b1:c2:d3:e4:f5',
      'A4-B1-C2-D3-E4-F5',
      'a4b1.c2d3.e4f5',
      'A4B1C2D3E4F5',
      ' a4:b1:c2:d3:e4:f5 ',
    ]) {
      expect(normaliseMac(raw)).toBe(want);
    }
  });

  it('refuses anything that is not a device', () => {
    // MikroTik substitutes an empty $(mac) when it has none, and the portal
    // passes whatever arrives straight through. A row keyed on '' would be
    // one row shared by every device that ever hit that path.
    expect(normaliseMac('')).toBeNull();
    expect(normaliseMac(null)).toBeNull();
    expect(normaliseMac(undefined)).toBeNull();
    expect(normaliseMac('$(mac)')).toBeNull();
    expect(normaliseMac('A4:B1:C2:D3:E4')).toBeNull();
    expect(normaliseMac('A4:B1:C2:D3:E4:F5:06')).toBeNull();
    expect(normaliseMac('00:00:00:00:00:00')).toBeNull();
  });
});

describe('whether a device is still kept', () => {
  it('keeps one that was asked for and has not lapsed', () => {
    expect(isRemembered(device(), NOW)).toBe(true);
  });

  it('lets go when the person unticked the box', () => {
    expect(isRemembered(device({ remembered: false }), NOW)).toBe(false);
  });

  it('lets go when it was revoked, however long it has left', () => {
    // A lost handset. The expiry is months away and must not matter.
    expect(isRemembered(device({ revokedAt: new Date('2026-10-01') }), NOW)).toBe(false);
  });

  it('lets go when it simply stopped coming', () => {
    expect(isRemembered(device({ expiresAt: new Date('2026-10-30') }), NOW)).toBe(false);
  });

  it('treats a device nobody enrolled as not kept, rather than throwing', () => {
    expect(isRemembered(null, NOW)).toBe(false);
    expect(isRemembered(undefined, NOW)).toBe(false);
  });
});

describe('what the router is told', () => {
  it('names the remembering profile for a kept device', () => {
    const g = grantFor(device(), NOW);
    expect(g.profile).toBe(PROFILE_REMEMBERED);
    expect(g.remembered).toBe(true);
    expect(g.sessionSeconds).toBe(REMEMBERED_SESSION_SECONDS);
  });

  it('gives an unknown device exactly what it got before any of this existed', () => {
    const g = grantFor(null, NOW);
    expect(g.profile).toBe(PROFILE_ONE_VISIT);
    expect(g.remembered).toBe(false);
    expect(g.sessionSeconds).toBe(SESSION_SECONDS);
  });

  it('does not grant a year-long session to anybody', () => {
    // The session timeout is not what makes a phone rejoin — the MAC cookie
    // is — so there is nothing to buy by making it enormous, and a
    // reauthentication is the only moment a dismissed account is re-checked.
    expect(REMEMBERED_SESSION_SECONDS).toBeLessThanOrEqual(31 * 24 * 60 * 60);
    expect(REMEMBERED_SESSION_SECONDS).toBeGreaterThan(SESSION_SECONDS);
  });

  it('keeps the two profile names distinct and non-empty', () => {
    // They are matched by name against deploy/mikrotik/hotspot-setup.rsc, and
    // a name the router does not have is a rejected login, not a no-op.
    expect(PROFILE_REMEMBERED).not.toBe(PROFILE_ONE_VISIT);
    expect(PROFILE_REMEMBERED.length).toBeGreaterThan(0);
    expect(PROFILE_ONE_VISIT.length).toBeGreaterThan(0);
  });
});

describe('the profile names match the router script', () => {
  it('is the same pair of names in both files', async () => {
    // The one failure mode nobody would catch by reading: these are typed in
    // a TypeScript constant and in a RouterOS script, and a disagreement
    // between them locks staff out of the Wi-Fi rather than logging anything.
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const rsc = readFileSync(
      join(process.cwd(), 'deploy', 'mikrotik', 'hotspot-setup.rsc'), 'utf8',
    );
    expect(rsc).toContain(`name="${PROFILE_REMEMBERED}"`);
    expect(rsc).toContain(`name="${PROFILE_ONE_VISIT}"`);
  });

  it('gives the remembering profile a cookie and the other none', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const rsc = readFileSync(
      join(process.cwd(), 'deploy', 'mikrotik', 'hotspot-setup.rsc'), 'utf8',
    );
    // Only the lines that actually configure the profile; the `:if [find …]`
    // guard above each one names it too.
    const configuring = (name: string) => rsc.split('\n')
      .filter((l) => l.includes(`name="${name}"`) && l.includes('add-mac-cookie='));
    const remembered = configuring(PROFILE_REMEMBERED);
    const once = configuring(PROFILE_ONE_VISIT);
    expect(remembered.length).toBeGreaterThan(0);
    expect(once.length).toBeGreaterThan(0);
    // add-mac-cookie is the entire mechanism. Inverted, the box would do the
    // opposite of what it says on both settings at once.
    for (const l of remembered) expect(l).toMatch(/add-mac-cookie=yes/);
    for (const l of once) expect(l).toMatch(/add-mac-cookie=no/);
  });
});

describe('the expiry', () => {
  it('is pushed out by the full window from whenever it is renewed', () => {
    const e = expiryFrom(NOW);
    const days = (e.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(REMEMBER_DAYS);
  });

  it('is long enough that a rota never meets the portal twice', () => {
    expect(REMEMBER_DAYS).toBeGreaterThanOrEqual(30);
  });

  it('is said in Enugu time, not the server’s', () => {
    // 00:30 WAT on 3 November is 23:30 UTC on the 2nd. Told "until 2
    // November" on the day it still works is a support call.
    expect(rememberedUntil(new Date('2026-11-02T23:30:00Z'))).toBe('3 November 2026');
  });
});

describe('recognising your own phone in a list', () => {
  const mac = 'A4:B1:C2:D3:E4:F5';

  it('names the handset where the browser says', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', mac))
      .toBe('iPhone · E4F5');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit', mac))
      .toBe('SM-A135F · E4F5');
  });

  it('still says something useful when the browser says nothing', () => {
    expect(deviceLabel(null, mac)).toBe('Device · E4F5');
    expect(deviceLabel('', mac)).toBe('Device · E4F5');
  });

  it('always carries the last four digits, which is what IT reads out', () => {
    for (const ua of [null, 'iPad', 'Windows NT 10.0', 'Macintosh; Intel Mac OS X']) {
      expect(deviceLabel(ua, mac)).toContain('E4F5');
    }
  });
});

describe('two sessions per member of staff', () => {
  /**
   * A MikroTik hotspot user profile gives one session per username unless
   * somebody says otherwise -- `shared-users` defaults to 1 -- so before this
   * a registrar who opened the portal on a tablet knocked their own phone off
   * the network, usually without understanding why. The work here is a phone
   * on the ward and a laptop the notes are written on.
   *
   * Not unlimited, for the same reason the enrolment expires: a hospital
   * password travels. A cap of two is what makes that show up, as somebody's
   * own device being logged out, rather than quietly serving a waiting room.
   */
  it('is two', () => {
    expect(MAX_SESSIONS_PER_STAFF).toBe(2);
  });

  it('is in the grant for a remembered device', () => {
    expect(grantFor(device(), NOW).sessionLimit).toBe(2);
  });

  it('is the SAME for a device nobody asked to remember', () => {
    // Somebody who did not tick "keep me signed in" has not asked for fewer
    // devices, and a cap that moved with an unrelated choice would be
    // impossible to explain at the moment it bit them.
    expect(grantFor(null, NOW).sessionLimit).toBe(2);
    expect(grantFor(device({ revokedAt: NOW }), NOW).sessionLimit).toBe(2);
  });

  it('does not disturb the session lengths it sits beside', () => {
    expect(grantFor(device(), NOW).sessionSeconds).toBe(REMEMBERED_SESSION_SECONDS);
    expect(grantFor(null, NOW).sessionSeconds).toBe(SESSION_SECONDS);
  });
});

describe('the router is told the same number', () => {
  const rsc = read('deploy/mikrotik/hotspot-setup.rsc');

  it('sets shared-users on every profile a login can land on', () => {
    // Three, and the default one matters most: when RADIUS_HOTSPOT_PROFILES is
    // not set the bridge names no profile at all, and every login lands there.
    // Comment lines are excluded: the block explaining the setting names it
    // too, and a test that counted prose would pass on a file where somebody
    // had written about shared-users without setting it.
    const set = rsc.split('\n')
      .filter((l) => !l.trimStart().startsWith('#') && l.includes('shared-users=2'));
    expect(set.length).toBe(5);
  });

  it('sets it on the default profile', () => {
    expect(rsc).toMatch(/find where default=yes\].*shared-users=2/);
  });

  it('sets it on both named profiles', () => {
    for (const name of [PROFILE_REMEMBERED, PROFILE_ONE_VISIT]) {
      const lines = rsc.split('\n').filter((l) => l.includes(name) && l.includes('user profile'));
      expect(lines.length).toBe(3);
      // add and set; the `find where name=` line is the guard.
      expect(lines.filter((l) => l.includes('shared-users=2')).length).toBe(2);
    }
  });

  it('matches the constant rather than a number somebody typed twice', () => {
    expect(rsc).toContain(`shared-users=${MAX_SESSIONS_PER_STAFF}`);
  });
});

describe('the bridge returns it too', () => {
  const bridge = read('scripts/local-server/radius-bridge.ts');

  it('sends Port-Limit from the grant, not from a literal', () => {
    // Belt and braces for a router whose profiles were never re-provisioned.
    // RouterOS honours it inconsistently for hotspot, which is why the profile
    // is still what does the work -- but both read one constant, so they can
    // never disagree about the answer.
    expect(bridge).toContain('ATTR_PORT_LIMIT, grant.sessionLimit');
  });

  it('uses the RFC number for Port-Limit', () => {
    expect(read('src/lib/radius/packet.ts')).toContain('ATTR_PORT_LIMIT = 62');
  });
});
