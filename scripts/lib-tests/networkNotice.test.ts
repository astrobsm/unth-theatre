import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  THEATRE_NETWORK_NOTICE,
  withNetworkNotice,
  WIFI_PAGE,
} from '../../src/lib/comms/networkNotice';
import { PRIMARY_SSID, THEATRE_SSIDS } from '../../src/lib/hotspot/wifi';
import { buildDutyChase, buildDutyCommendation } from '../../src/lib/dutyPerformance/messages';
import { buildCelebrationMessage } from '../../src/lib/celebrations/messages';
import { buildReviewChaseMessage } from '../../src/lib/anaesthesia/reviewChaseMessage';
import { buildBookerChaseMessage } from '../../src/lib/bookerChaseMessage';
import { DUTIES } from '../../src/lib/dutyPerformance/types';

describe('the theatre network notice', () => {
  it('names the SSID the router actually broadcasts', () => {
    // IT WAS DICTATED TO US AS "UNTH-THEATHER-ORM", with THEATRE transposed.
    // The router does not broadcast that, so every recipient would have
    // hunted for a network that is not there -- and trusted the next notice
    // less. Taken from the constant the QR code and the MikroTik config are
    // built from, so it cannot drift from the router again.
    expect(THEATRE_NETWORK_NOTICE).toContain('UNTH-THEATRE-ORM');
    expect(THEATRE_NETWORK_NOTICE).not.toContain('THEATHER');
    expect(PRIMARY_SSID).toBe('UNTH-THEATRE-ORM');
    expect(THEATRE_SSIDS).toContain(PRIMARY_SSID);
  });

  it('agrees with the SSID the router is configured with', () => {
    // The one place the two could drift apart is the .rsc that provisions
    // the hotspot. If somebody renames the network there, this fails rather
    // than two hundred staff being sent the old name.
    const rsc = readFileSync(
      join(__dirname, '..', '..', 'deploy', 'mikrotik', 'hotspot-setup.rsc'),
      'utf8',
    );
    if (/ssid=/i.test(rsc)) expect(rsc).toContain(PRIMARY_SSID);
  });

  it('never prints the Wi-Fi key', () => {
    // The network is WPA2 and the key is deliberately kept behind an app
    // login -- see src/lib/hotspot/wifi.ts on why it is not an open network.
    // A WhatsApp message is forwarded; a key in one is published.
    expect(THEATRE_NETWORK_NOTICE).not.toContain('93934015');
    expect(THEATRE_NETWORK_NOTICE).not.toMatch(/\b\d{8,}\b/);
    // It says where the key is instead of leaving people stuck.
    expect(THEATRE_NETWORK_NOTICE).toContain(WIFI_PAGE);
  });

  it('says the portal login is their ORM account', () => {
    expect(THEATRE_NETWORK_NOTICE).toMatch(/ORM username and password/i);
    expect(THEATRE_NETWORK_NOTICE).toMatch(/fully optimised/i);
  });

  it('is set off so it is not read as another paragraph of the chase', () => {
    // On a phone, an unseparated block at the end of a long message is not
    // seen at all.
    expect(THEATRE_NETWORK_NOTICE.split('\n')[0]).toMatch(/^─+$/);
    expect(THEATRE_NETWORK_NOTICE.trim().split('\n').pop()).toMatch(/^─+$/);
    expect(THEATRE_NETWORK_NOTICE).toContain('*\u{1F4F6} THEATRE INTERNET');
  });

  it('is not added twice', () => {
    const once = withNetworkNotice('Dear colleague,');
    expect(withNetworkNotice(once)).toBe(once);
    expect(once.split('UNTH-THEATRE-ORM')).toHaveLength(2);
  });
});

const perf = { total: 14, done: 6, late: 3, outstanding: 8, medianMarginMinutes: null } as never;

describe('which messages carry it', () => {
  it('every duty chase and every duty commendation', () => {
    for (const key of Object.keys(DUTIES) as (keyof typeof DUTIES)[]) {
      const chase = buildDutyChase({
        personName: 'Dr A', duty: key, performance: perf, periodLabel: 'October 2026',
      });
      expect(chase, key).toContain('UNTH-THEATRE-ORM');
      const thanks = buildDutyCommendation({
        personName: 'Dr A', duty: key, performance: perf, periodLabel: 'October 2026',
      });
      expect(thanks, key).toContain('UNTH-THEATRE-ORM');
    }
  });

  it('the review chase, in both registers', () => {
    for (const register of ['LATE', 'MISSED'] as const) {
      expect(buildReviewChaseMessage({ reviewerName: 'Dr A', register }))
        .toContain('UNTH-THEATRE-ORM');
    }
  });

  it('the booker chase', () => {
    expect(buildBookerChaseMessage({ patientName: 'A', outstanding: 'CONSENT' }))
      .toContain('UNTH-THEATRE-ORM');
  });

  it('NOT a birthday or new-month greeting', () => {
    // This module exists to keep one rule: a greeting that reminds you about
    // the ORM is a duty chase with a ribbon on it, and the person reading it
    // learns the hospital only writes when it wants something. Those people
    // get the chases and commendations too, so they see the notice -- just
    // not on their birthday.
    const greeting = buildCelebrationMessage({
      occasion: { kind: 'NEW_MONTH', date: '2026-11-01' } as never,
      personName: 'Dr A',
      role: 'SCRUB_NURSE',
    });
    expect(greeting).not.toContain('UNTH-THEATRE-ORM');
    expect(greeting).not.toMatch(/\bORM\b/);
  });
});

describe('the scrub nurse timing chase', () => {
  const chase = buildDutyChase({
    personName: 'Sr Adaeze Nwankwo',
    duty: 'SURGERY_TIMING',
    performance: perf,
    periodLabel: 'October 2026',
    roleLabel: 'Scrub Nurse',
  });

  it('asks for the times in real time, not written up afterwards', () => {
    expect(chase).toMatch(/in real time/i);
    expect(chase).toMatch(/AS IT HAPPENS/);
    expect(chase).toMatch(/not written up afterwards/i);
    expect(chase).toMatch(/incision time as the surgeon begins|time of incision when the surgeon begins/i);
    expect(chase).toMatch(/end of procedure/i);
  });

  it('states the legal weight of the record', () => {
    expect(chase).toMatch(/contemporaneous/i);
    expect(chase).toMatch(/claim/i);
    expect(chase).toMatch(/first document called for/i);
    expect(chase).toMatch(/read against the institution/i);
    expect(chase).toMatch(/nurse named on the case/i);
  });

  it('puts the appeal and the instructions before the legal paragraph', () => {
    // Opening with liability produces a colleague who replies explaining it
    // was not their fault. The outcome wanted is the time entered tomorrow.
    const appeal = chase.indexOf('This is an appeal, not an accusation');
    const how = chase.indexOf('How it is done');
    const legal = chase.indexOf('WHY THIS ONE IS DIFFERENT');
    expect(appeal).toBeGreaterThan(-1);
    expect(legal).toBeGreaterThan(how);
    expect(how).toBeGreaterThan(appeal);
  });

  it('does not threaten, and invents no law', () => {
    expect(chase).toMatch(/None of that is a threat/i);
    expect(chase).not.toMatch(/section \d|cap\.? \d|\bdecree\b|act of \d{4}/i);
    expect(chase).not.toMatch(/you will be (sacked|dismissed|suspended|prosecuted)/i);
  });

  it('never appears in a commendation', () => {
    // A thank-you that mentions liability is a warning with a compliment
    // attached, and nobody is thanked by that.
    const thanks = buildDutyCommendation({
      personName: 'Sr Adaeze Nwankwo',
      duty: 'SURGERY_TIMING',
      performance: { total: 14, done: 14, late: 0, outstanding: 0, medianMarginMinutes: -4 } as never,
      periodLabel: 'October 2026',
    });
    expect(thanks).not.toMatch(/WHY THIS ONE IS DIFFERENT/);
    expect(thanks).not.toMatch(/read against the institution/i);
  });

  it('is carried by only the duties whose record is itself evidence', () => {
    // A legal block on every duty is a legal block on none: staff learn to
    // scroll past it, and it carries no weight on the day it matters.
    const withLegal = (Object.keys(DUTIES) as (keyof typeof DUTIES)[])
      .filter((k) => DUTIES[k].legalWeight);
    expect(withLegal).toEqual(['SURGERY_TIMING']);
  });
});

describe('the duty messages read like English', () => {
  it('does not bolt an s onto the end of a duty label', () => {
    // It used to produce "6 of 14 recording start and end of surgerys".
    for (const key of Object.keys(DUTIES) as (keyof typeof DUTIES)[]) {
      const msg = buildDutyChase({
        personName: 'Dr A', duty: key, performance: perf, periodLabel: 'October 2026',
      });
      // The literal wreckage the old line produced, not a broad "ys" rule:
      // ordinary words end in "ys", and a guard that flags "your phone" is
      // a guard somebody deletes.
      expect(msg, key).not.toContain(`${DUTIES[key].label.toLowerCase()}s`);
      expect(msg, key).not.toContain('surgerys');
      expect(msg, key).toContain(`6 of 14 ${DUTIES[key].verb}`);
    }
  });

  it('says "you have recorded", not "you did recorded"', () => {
    // The verbs are past participles; all ten read ungrammatically before.
    for (const key of Object.keys(DUTIES) as (keyof typeof DUTIES)[]) {
      const msg = buildDutyChase({
        personName: 'Dr A', duty: key, performance: perf, periodLabel: 'October 2026',
      });
      expect(msg, key).toContain(`you have ${DUTIES[key].verb}`);
      expect(msg, key).not.toContain(`you did ${DUTIES[key].verb}`);
    }
  });
});
