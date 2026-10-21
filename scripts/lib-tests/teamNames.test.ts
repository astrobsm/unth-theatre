/**
 * The same person, twice on one card.
 *
 * Reported from the unit list, both real:
 *
 *   GS Unit I   Surgeon        Nwosu EvanTherese       07038369904
 *               Snr registrar  Dr Nwosu evantherese    no number
 *
 *   PS Unit 2   House officer  Praise Nzubechukwu Oko  no number
 *               House officer  Praise Nzubechukwu oko  08141981079
 *
 * The card compared names with ===, so a capital letter or a "Dr " made one
 * person into two. The second pair is the one that actually costs something:
 * the same house officer listed twice, once with a number and once without,
 * so the card makes a person at seven in the morning choose between two rows
 * when one of them cannot be rung.
 *
 * The tests below are as much about what must NOT be merged. Hiding a real
 * second person from the card is worse than printing somebody twice.
 */
import { describe, expect, it } from 'vitest';

import { normaliseStaffName, dedupeTeam, type TeamEntry } from '../../src/lib/theatre/teamNames';

const ROLE_ORDER = ['Surgeon', 'Consultant', 'Snr registrar', 'Registrar', 'House officer'];

describe('the comparison form of a name', () => {
  it('ignores capitals', () => {
    expect(normaliseStaffName('Praise Nzubechukwu Oko'))
      .toBe(normaliseStaffName('Praise Nzubechukwu oko'));
  });

  it('ignores a title', () => {
    expect(normaliseStaffName('Dr Nwosu evantherese'))
      .toBe(normaliseStaffName('Nwosu EvanTherese'));
  });

  it('ignores stacked titles and stray punctuation', () => {
    expect(normaliseStaffName('Prof. Dr  Ade-Bello')).toBe('ade bello');
    expect(normaliseStaffName("Dr. O'Brien")).toBe('o brien');
  });

  it('collapses runs of spaces', () => {
    expect(normaliseStaffName('Praise   Nzubechukwu    Oko')).toBe('praise nzubechukwu oko');
  });

  it('gives nothing for nothing', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(normaliseStaffName(v)).toBe('');
    }
  });

  it('does NOT merge two different people', () => {
    // The dangerous direction. These are four distinct staff.
    const names = ['Nwosu Evantherese', 'Nwosu Emmanuel', 'Praise Oko', 'Praise Nzubechukwu Oko'];
    const keys = names.map(normaliseStaffName);
    expect(new Set(keys).size).toBe(4);
  });
});

describe('collapsing a unit team', () => {
  it('merges the GS Unit I case and keeps the number', () => {
    const out = dedupeTeam([
      { name: 'Nwosu EvanTherese', phone: '07038369904', role: 'Surgeon' },
      { name: 'Dr Nwosu evantherese', phone: null, role: 'Snr registrar' },
    ], ROLE_ORDER);
    expect(out).toHaveLength(1);
    expect(out[0].phone).toBe('07038369904');
    expect(out[0].role).toBe('Surgeon');
  });

  it('merges the PS Unit 2 case, taking the number from the SECOND entry', () => {
    // THE ONE THAT MATTERS. The entry with the number came second; keeping
    // the first blindly would print a house officer nobody can ring.
    const out = dedupeTeam([
      { name: 'Praise Nzubechukwu Oko', phone: null, role: 'House officer' },
      { name: 'Praise Nzubechukwu oko', phone: '08141981079', role: 'House officer' },
    ], ROLE_ORDER);
    expect(out).toHaveLength(1);
    expect(out[0].phone).toBe('08141981079');
  });

  it('keeps the first spelling for display', () => {
    const out = dedupeTeam([
      { name: 'Praise Nzubechukwu Oko', phone: null, role: 'House officer' },
      { name: 'praise nzubechukwu oko', phone: '0814', role: 'House officer' },
    ], ROLE_ORDER);
    expect(out[0].name).toBe('Praise Nzubechukwu Oko');
  });

  it('prefers the more senior role when a person holds two', () => {
    const out = dedupeTeam([
      { name: 'A Surgeon', phone: '070', role: 'Registrar' },
      { name: 'A Surgeon', phone: '070', role: 'Surgeon' },
    ], ROLE_ORDER);
    expect(out[0].role).toBe('Surgeon');
  });

  it('leaves genuinely different people alone', () => {
    const team: TeamEntry[] = [
      { name: 'Eze Chinonso B', phone: '08061131525', role: 'Surgeon' },
      { name: 'Onyia Ugochukwu Obinna Chibuife', phone: '08034346605', role: 'Snr registrar' },
      { name: 'Ndiana-Abasi Tom', phone: '09034503428', role: 'Registrar' },
    ];
    expect(dedupeTeam(team, ROLE_ORDER)).toHaveLength(3);
  });

  it('drops a nameless entry rather than printing a blank row', () => {
    const out = dedupeTeam([
      { name: '', phone: '070', role: 'Surgeon' },
      { name: '   ', phone: null, role: 'Registrar' },
      { name: 'Real Person', phone: null, role: 'House officer' },
    ], ROLE_ORDER);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Real Person');
  });

  it('keeps the order people were added in', () => {
    const out = dedupeTeam([
      { name: 'First', phone: null, role: 'Surgeon' },
      { name: 'Second', phone: null, role: 'Registrar' },
      { name: 'first', phone: '070', role: 'Registrar' },
    ], ROLE_ORDER);
    expect(out.map((e) => e.name)).toEqual(['First', 'Second']);
  });

  it('handles an empty team', () => {
    expect(dedupeTeam([], ROLE_ORDER)).toEqual([]);
  });
});
